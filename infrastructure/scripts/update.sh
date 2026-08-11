#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$project_dir"
[ -f .env ] || { printf '.env not found in %s\n' "$project_dir" >&2; exit 2; }
set -a
. "$project_dir/.env"
set +a

stamp=$(date -u +%Y%m%dT%H%M%SZ)
printf '1/5 Validate Compose configuration\n'
docker compose config >/dev/null

printf '2/5 Back up database and files\n'
BACKUP_STAMP="$stamp" "$project_dir/infrastructure/scripts/backup.sh"

printf '3/5 Pull linux/amd64 application images\n'
docker compose pull reverse-proxy web api api-storage-init

printf '4/5 Recreate application containers\n'
docker compose up -d --remove-orphans reverse-proxy web api api-storage-init db

printf '5/5 Wait for application health\n'
attempt=0
while [ "$attempt" -lt 24 ]; do
  if wget -qO- "http://127.0.0.1:${PUBLIC_PORT:-8080}/api/v1/health" >/dev/null 2>&1; then
    cp .env .env.last-successful
    printf 'Update complete: %s\n' "$PUBLIC_APP_URL"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 5
done

printf 'Health check failed. Recent logs:\n' >&2
docker compose logs --tail=120 reverse-proxy web api >&2
if [ -f .env.last-successful ]; then
  cp .env ".env.failed-$stamp"
  cp .env.last-successful .env
  docker compose up -d --remove-orphans reverse-proxy web api api-storage-init db
  printf 'Previous successful configuration restored. Failed configuration: .env.failed-%s\n' "$stamp" >&2
  printf 'Database migrations are not rolled back automatically. If the previous API remains unhealthy, restore backup %s/%s with infrastructure/scripts/restore.sh.\n' "${BACKUP_DATA_PATH:-$project_dir/data/backups}" "$stamp" >&2
fi
exit 1
