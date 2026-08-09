#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s /absolute/path/to/backup-directory\n' "$0" >&2
  exit 2
fi

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
[ -f "$project_dir/.env" ] && { set -a; . "$project_dir/.env"; set +a; }
source_dir=$1
case "$source_dir" in /*) ;; *) printf 'Backup path must be absolute\n' >&2; exit 2 ;; esac
[ -f "$source_dir/database.dump" ] || { printf 'database.dump not found\n' >&2; exit 2; }

cd "$source_dir"
sha256sum -c SHA256SUMS
stamp=$(basename "$source_dir")
cd "$project_dir"
printf 'This replaces all database objects. Stop web/API writes first.\nType RESTORE to continue: '
read -r answer
[ "$answer" = "RESTORE" ] || { printf 'Cancelled\n'; exit 1; }
docker compose stop api web
docker compose cp "$source_dir/database.dump" "db:/data/backups/$stamp/database.dump"
docker compose exec -T db pg_restore \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  "/data/backups/$stamp/database.dump"
upload_dir=${UPLOAD_DATA_PATH:-"$project_dir/data/uploads"}
journal_dir=${JOURNAL_IMPORT_PATH:-"$project_dir/data/journal-import"}
mkdir -p "$upload_dir" "$journal_dir"
[ ! -f "$source_dir/uploads.tar.gz" ] || tar -C "$upload_dir" -xzf "$source_dir/uploads.tar.gz"
[ ! -f "$source_dir/journal-import.tar.gz" ] || tar -C "$journal_dir" -xzf "$source_dir/journal-import.tar.gz"
docker compose start api web
printf 'Restore complete. Verify /api/v1/health and critical records.\n'
