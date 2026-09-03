#!/bin/sh
set -eu

: "${PROXY_IMAGE:?PROXY_IMAGE is required}"
: "${WEB_IMAGE:?WEB_IMAGE is required}"
: "${API_IMAGE:?API_IMAGE is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

lock_dir=/tmp/la-vie-update.lock
if ! mkdir "$lock_dir" 2>/dev/null; then
  printf 'Another update is already running.\n'
  exit 0
fi
cleanup_lock() { rmdir "$lock_dir" 2>/dev/null || true; }
trap cleanup_lock 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

project_name=${COMPOSE_PROJECT_NAME:-task-platform}
backup_dir=/data/backups
upload_dir=/data/uploads
journal_dir=/data/journal-import
retention_days=${BACKUP_RETENTION_DAYS:-30}
health_attempts=${UPDATE_HEALTH_ATTEMPTS:-36}
stamp=$(date -u +%Y%m%dT%H%M%SZ)

case "$retention_days" in
  *[!0-9]*|"") printf 'BACKUP_RETENTION_DAYS must be a non-negative integer.\n' >&2; exit 2 ;;
esac
case "$health_attempts" in
  *[!0-9]*|"") printf 'UPDATE_HEALTH_ATTEMPTS must be a positive integer.\n' >&2; exit 2 ;;
esac
[ "$health_attempts" -gt 0 ] || { printf 'UPDATE_HEALTH_ATTEMPTS must be greater than zero.\n' >&2; exit 2; }

container_id_for_service() {
  docker ps \
    --filter "label=com.docker.compose.project=$project_name" \
    --filter "label=com.docker.compose.service=$1" \
    --format '{{.ID}}' | head -n 1
}

container_name_for_id() {
  docker inspect --format '{{.Name}}' "$1" | sed 's#^/##'
}

running_image_id() {
  docker inspect --format '{{.Image}}' "$1"
}

configured_image_id() {
  docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || true
}

configured_image_version() {
  docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "$1" 2>/dev/null || true
}

image_repository() {
  image_without_digest=${1%%@*}
  image_last_part=${image_without_digest##*/}
  case "$image_last_part" in
    *:*) printf '%s\n' "${image_without_digest%:*}" ;;
    *) printf '%s\n' "$image_without_digest" ;;
  esac
}

tag_previous_image() {
  old_id=$1
  new_id=$2
  configured_ref=$3
  [ "$old_id" != "$new_id" ] || return 0
  repository=$(image_repository "$configured_ref")
  docker image tag "$old_id" "$repository:previous"
  printf 'Rollback image retained: %s:previous\n' "$repository"
}

run_recreation() {
  watchtower \
    --run-once \
    --no-pull \
    --label-enable \
    --rolling-restart \
    --stop-timeout 30s \
    --no-startup-message \
    "$proxy_name" "$web_name" "$api_name"
}

app_is_healthy() {
  wget -qO- "http://reverse-proxy:8080/api/v1/health" >/dev/null 2>&1
}

wait_for_health() {
  attempt=0
  while [ "$attempt" -lt "$health_attempts" ]; do
    if app_is_healthy; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 5
  done
  return 1
}

create_backup() {
  target="$backup_dir/$stamp"
  mkdir -p "$target"
  pg_dump "$DATABASE_URL" \
    --format custom \
    --no-owner \
    --file "$target/database.dump"
  tar -C "$upload_dir" -czf "$target/uploads.tar.gz" .
  tar -C "$journal_dir" -czf "$target/journal-import.tar.gz" .
  {
    printf 'proxy=%s version=%s\n' "$PROXY_IMAGE" "$new_proxy_version"
    printf 'web=%s version=%s\n' "$WEB_IMAGE" "$new_web_version"
    printf 'api=%s version=%s\n' "$API_IMAGE" "$new_api_version"
  } > "$target/images.txt"
  printf '%s\n' "$new_api_version" > "$target/app-version.txt"
  sha256sum \
    "$target/database.dump" \
    "$target/uploads.tar.gz" \
    "$target/journal-import.tar.gz" \
    "$target/images.txt" \
    "$target/app-version.txt" > "$target/SHA256SUMS"
  printf 'Backup created: %s\n' "$target"

  if [ "$retention_days" -gt 0 ]; then
    find "$backup_dir" \
      -mindepth 1 \
      -maxdepth 1 \
      -type d \
      -name '20??????T??????Z' \
      -mtime "+$retention_days" \
      -exec rm -rf {} \;
  fi
}

prune_repository() {
  configured_ref=$1
  repository=$(image_repository "$configured_ref")
  current_id=$(configured_image_id "$configured_ref")
  previous_id=$(configured_image_id "$repository:previous")

  [ -n "$current_id" ] || return 0
  [ -n "$previous_id" ] || return 0

  docker image ls "$repository" --no-trunc --format '{{.Repository}}:{{.Tag}}|{{.ID}}' |
  while IFS='|' read -r reference candidate_id; do
    case "$reference" in
      "$repository":*) ;;
      *) continue ;;
    esac
    [ "$candidate_id" != "$current_id" ] || continue
    [ "$candidate_id" != "$previous_id" ] || continue
    if docker image rm "$reference" >/dev/null 2>&1; then
      printf 'Removed superseded image: %s\n' "$reference"
    fi
  done
}

printf '1/8 Check Docker access and locate the La Vie containers\n'
docker info >/dev/null
proxy_container=$(container_id_for_service reverse-proxy)
web_container=$(container_id_for_service web)
api_container=$(container_id_for_service api)
if [ -z "$proxy_container" ] || [ -z "$web_container" ] || [ -z "$api_container" ]; then
  printf 'Could not find running reverse-proxy, web and api containers in Compose project %s.\n' "$project_name" >&2
  exit 1
fi
proxy_name=$(container_name_for_id "$proxy_container")
web_name=$(container_name_for_id "$web_container")
api_name=$(container_name_for_id "$api_container")

old_proxy_id=$(running_image_id "$proxy_container")
old_web_id=$(running_image_id "$web_container")
old_api_id=$(running_image_id "$api_container")

printf '2/8 Pull the stable application images\n'
docker pull "$PROXY_IMAGE"
docker pull "$WEB_IMAGE"
docker pull "$API_IMAGE"
new_proxy_id=$(configured_image_id "$PROXY_IMAGE")
new_web_id=$(configured_image_id "$WEB_IMAGE")
new_api_id=$(configured_image_id "$API_IMAGE")
new_proxy_version=$(configured_image_version "$PROXY_IMAGE")
new_web_version=$(configured_image_version "$WEB_IMAGE")
new_api_version=$(configured_image_version "$API_IMAGE")

if [ -z "$new_proxy_id" ] || [ -z "$new_web_id" ] || [ -z "$new_api_id" ]; then
  printf 'One or more application images could not be resolved after pulling.\n' >&2
  exit 1
fi
if [ -z "$new_proxy_version" ] || [ "$new_proxy_version" != "$new_web_version" ] || [ "$new_proxy_version" != "$new_api_version" ]; then
  printf 'The stable channel contains mismatched component versions; retry later.\n' >&2
  printf 'proxy=%s web=%s api=%s\n' "$new_proxy_version" "$new_web_version" "$new_api_version" >&2
  exit 1
fi

if [ "$old_proxy_id" = "$new_proxy_id" ] && [ "$old_web_id" = "$new_web_id" ] && [ "$old_api_id" = "$new_api_id" ]; then
  printf 'Already up to date; no backup or restart is needed.\n'
  exit 0
fi

printf '3/8 Back up PostgreSQL and persistent files\n'
create_backup

printf '4/8 Retain the currently running images for rollback\n'
tag_previous_image "$old_proxy_id" "$new_proxy_id" "$PROXY_IMAGE"
tag_previous_image "$old_web_id" "$new_web_id" "$WEB_IMAGE"
tag_previous_image "$old_api_id" "$new_api_id" "$API_IMAGE"

printf '5/8 Recreate only the three labelled application containers\n'
run_recreation

printf '6/8 Wait for the application health endpoint\n'
if wait_for_health; then
  printf '7/8 Application is healthy\n'
  if [ "${AUTO_PRUNE_APP_IMAGES:-true}" = "true" ]; then
    printf '8/8 Keep current and previous images; remove older app images\n'
    prune_repository "$PROXY_IMAGE"
    prune_repository "$WEB_IMAGE"
    prune_repository "$API_IMAGE"
  else
    printf '8/8 Image cleanup is disabled\n'
  fi
  printf 'Update complete: version %s\n' "$new_api_version"
  exit 0
fi

printf 'The new release is unhealthy; restoring the previous images.\n' >&2
docker image tag "$old_proxy_id" "$PROXY_IMAGE"
docker image tag "$old_web_id" "$WEB_IMAGE"
docker image tag "$old_api_id" "$API_IMAGE"
run_recreation
if wait_for_health; then
  printf 'Previous release restored. Failed update backup: %s/%s\n' "$backup_dir" "$stamp" >&2
  exit 1
fi

printf 'Automatic rollback is also unhealthy. Inspect the api, web and reverse-proxy logs. Backup: %s/%s\n' "$backup_dir" "$stamp" >&2
exit 1
