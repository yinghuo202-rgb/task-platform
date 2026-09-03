#!/bin/sh
set -eu

case "${1:-}" in
  update)
    shift
    exec la-vie-update "$@"
    ;;
  sh|/bin/sh)
    exec "$@"
    ;;
esac

if [ "${MAINTENANCE_AUTO_UPDATE:-false}" = "true" ]; then
  interval=${UPDATE_INTERVAL_SECONDS:-21600}
  case "$interval" in
    *[!0-9]*|"")
      printf 'UPDATE_INTERVAL_SECONDS must be a positive integer.\n' >&2
      exit 2
      ;;
  esac
  [ "$interval" -gt 0 ] || {
    printf 'UPDATE_INTERVAL_SECONDS must be greater than zero.\n' >&2
    exit 2
  }

  printf 'La Vie automatic updater is enabled; next check in %s seconds.\n' "$interval"
  while :; do
    sleep "$interval"
    if ! la-vie-update; then
      printf 'Automatic update failed; the maintenance container will retry after %s seconds.\n' "$interval" >&2
    fi
  done
fi

printf 'La Vie maintenance container is ready. Run `la-vie-update` in its terminal to check for updates.\n'
while :; do
  sleep 3600 &
  wait "$!"
done
