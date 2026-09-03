#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$project_dir"
[ -f .env ] || { printf '.env not found in %s\n' "$project_dir" >&2; exit 2; }
set -a
. "$project_dir/.env"
set +a

image_repository() {
  image_without_digest=${1%%@*}
  image_last_part=${image_without_digest##*/}
  case "$image_last_part" in
    *:*) printf '%s\n' "${image_without_digest%:*}" ;;
    *) printf '%s\n' "$image_without_digest" ;;
  esac
}

image_id() {
  docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || true
}

prune_repository() {
  configured_ref=$1
  repository=$(image_repository "$configured_ref")
  current_id=$(image_id "$configured_ref")
  previous_id=$(image_id "$repository:previous")

  [ -n "$current_id" ] || {
    printf 'Skip %s: current image is unavailable.\n' "$repository" >&2
    return
  }
  [ -n "$previous_id" ] || {
    printf 'Skip %s: no verified previous release is available yet.\n' "$repository"
    return
  }

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
    else
      printf 'Kept in-use image: %s\n' "$reference"
    fi
  done
}

: "${PROXY_IMAGE:?PROXY_IMAGE is required}"
: "${WEB_IMAGE:?WEB_IMAGE is required}"
: "${API_IMAGE:?API_IMAGE is required}"

prune_repository "$PROXY_IMAGE"
prune_repository "$WEB_IMAGE"
prune_repository "$API_IMAGE"
