#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$project_dir"
[ -f .env ] || { printf '.env not found in %s\n' "$project_dir" >&2; exit 2; }
set -a
. "$project_dir/.env"
set +a

: "${PROXY_IMAGE:?PROXY_IMAGE is required}"
: "${WEB_IMAGE:?WEB_IMAGE is required}"
: "${API_IMAGE:?API_IMAGE is required}"

lock_dir="$project_dir/.update.lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
  printf 'Another update is already running.\n'
  exit 0
fi
cleanup_lock() { rmdir "$lock_dir" 2>/dev/null || true; }
trap cleanup_lock 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

stamp=$(date -u +%Y%m%dT%H%M%SZ)

running_image_id() {
  container_id=$(docker compose ps -q "$1" 2>/dev/null || true)
  [ -n "$container_id" ] || return 0
  docker inspect --format '{{.Image}}' "$container_id" 2>/dev/null || true
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
  [ -n "$old_id" ] || return 0
  [ "$old_id" != "$new_id" ] || return 0
  repository=$(image_repository "$configured_ref")
  docker image tag "$old_id" "$repository:previous"
  printf 'Rollback image retained: %s:previous\n' "$repository"
}

rollback_ref() {
  old_id=$1
  new_id=$2
  configured_ref=$3
  if [ -n "$old_id" ] && [ "$old_id" != "$new_id" ]; then
    printf '%s:previous\n' "$(image_repository "$configured_ref")"
  else
    printf '%s\n' "$configured_ref"
  fi
}

app_is_healthy() {
  wget -qO- "http://127.0.0.1:${PUBLIC_PORT:-8080}/api/v1/health" >/dev/null 2>&1
}

printf '1/7 Validate Compose configuration\n'
docker compose config >/dev/null

old_proxy_id=$(running_image_id reverse-proxy)
old_web_id=$(running_image_id web)
old_api_id=$(running_image_id api)

printf '2/7 Check the online release channel\n'
docker compose pull reverse-proxy web api api-storage-init
new_proxy_id=$(configured_image_id "$PROXY_IMAGE")
new_web_id=$(configured_image_id "$WEB_IMAGE")
new_api_id=$(configured_image_id "$API_IMAGE")
new_proxy_version=$(configured_image_version "$PROXY_IMAGE")
new_web_version=$(configured_image_version "$WEB_IMAGE")
new_api_version=$(configured_image_version "$API_IMAGE")

if [ -z "$new_proxy_version" ] || [ "$new_proxy_version" != "$new_web_version" ] || [ "$new_proxy_version" != "$new_api_version" ]; then
  printf 'The stable channel is still publishing or contains mismatched component versions; retry later.\n' >&2
  printf 'proxy=%s web=%s api=%s\n' "$new_proxy_version" "$new_web_version" "$new_api_version" >&2
  exit 1
fi

if [ -n "$old_proxy_id" ] && [ "$old_proxy_id" = "$new_proxy_id" ] \
  && [ -n "$old_web_id" ] && [ "$old_web_id" = "$new_web_id" ] \
  && [ -n "$old_api_id" ] && [ "$old_api_id" = "$new_api_id" ]; then
  printf 'Already up to date; no backup or container restart is needed.\n'
  exit 0
fi

[ -n "$new_proxy_id" ] && [ -n "$new_web_id" ] && [ -n "$new_api_id" ] || {
  printf 'One or more application images could not be resolved after pulling.\n' >&2
  exit 1
}

printf '3/7 Back up database and files\n'
BACKUP_STAMP="$stamp" "$project_dir/infrastructure/scripts/backup.sh"

printf '4/7 Retain the currently running release for rollback\n'
tag_previous_image "$old_proxy_id" "$new_proxy_id" "$PROXY_IMAGE"
tag_previous_image "$old_web_id" "$new_web_id" "$WEB_IMAGE"
tag_previous_image "$old_api_id" "$new_api_id" "$API_IMAGE"

previous_proxy_ref=$(rollback_ref "$old_proxy_id" "$new_proxy_id" "$PROXY_IMAGE")
previous_web_ref=$(rollback_ref "$old_web_id" "$new_web_id" "$WEB_IMAGE")
previous_api_ref=$(rollback_ref "$old_api_id" "$new_api_id" "$API_IMAGE")

printf '5/7 Recreate application containers from downloaded images\n'
docker compose up -d --pull never --remove-orphans reverse-proxy web api api-storage-init db

printf '6/7 Wait for application health\n'
attempt=0
while [ "$attempt" -lt 24 ]; do
  if app_is_healthy; then
    cp .env .env.last-successful
    printf '7/7 Remove superseded application images\n'
    if [ "${AUTO_PRUNE_APP_IMAGES:-true}" = "true" ]; then
      "$project_dir/infrastructure/scripts/prune-app-images.sh"
    else
      printf 'Image cleanup disabled by AUTO_PRUNE_APP_IMAGES.\n'
    fi
    printf 'Update complete: %s\n' "$PUBLIC_APP_URL"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 5
done

printf 'Health check failed. Recent logs:\n' >&2
docker compose logs --tail=120 reverse-proxy web api >&2
if [ -n "$old_proxy_id" ] && [ -n "$old_web_id" ] && [ -n "$old_api_id" ]; then
  printf 'Restoring the previous application images.\n' >&2
  PROXY_IMAGE="$previous_proxy_ref" \
    WEB_IMAGE="$previous_web_ref" \
    API_IMAGE="$previous_api_ref" \
    docker compose up -d --pull never --remove-orphans reverse-proxy web api api-storage-init db
  rollback_attempt=0
  while [ "$rollback_attempt" -lt 12 ]; do
    if app_is_healthy; then
      printf 'Previous release restored. Failed update backup: %s/%s\n' "${BACKUP_DATA_PATH:-$project_dir/data/backups}" "$stamp" >&2
      exit 1
    fi
    rollback_attempt=$((rollback_attempt + 1))
    sleep 5
  done
fi

printf 'Automatic rollback was unavailable or unhealthy. Restore backup %s/%s with infrastructure/scripts/restore.sh.\n' "${BACKUP_DATA_PATH:-$project_dir/data/backups}" "$stamp" >&2
exit 1
