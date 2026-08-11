#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
[ -f "$project_dir/.env" ] && { set -a; . "$project_dir/.env"; set +a; }
stamp=${BACKUP_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}
backup_dir=${BACKUP_DATA_PATH:-"$project_dir/data/backups"}
upload_dir=${UPLOAD_DATA_PATH:-"$project_dir/data/uploads"}
journal_dir=${JOURNAL_IMPORT_PATH:-"$project_dir/data/journal-import"}
target="$backup_dir/$stamp"

case "$backup_dir" in ""|"/"|"."|"..") printf 'Unsafe backup directory: %s\n' "$backup_dir" >&2; exit 2 ;; esac
retention_days=${BACKUP_RETENTION_DAYS:-30}
case "$retention_days" in *[!0-9]*|"") printf 'BACKUP_RETENTION_DAYS must be a non-negative integer\n' >&2; exit 2 ;; esac

mkdir -p "$target" "$upload_dir" "$journal_dir"
cd "$project_dir"
docker compose exec -T db pg_dump \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --format custom \
  --no-owner \
  --file "/data/backups/$stamp/database.dump"
tar -C "$upload_dir" -czf "$target/uploads.tar.gz" .
tar -C "$journal_dir" -czf "$target/journal-import.tar.gz" .
docker compose config --images | sort > "$target/images.txt"
git rev-parse HEAD > "$target/app-version.txt" 2>/dev/null || printf '%s\n' "unknown" > "$target/app-version.txt"
sha256sum "$target/database.dump" "$target/uploads.tar.gz" "$target/journal-import.tar.gz" "$target/images.txt" "$target/app-version.txt" > "$target/SHA256SUMS"
printf 'Backup created: %s\n' "$target"

if [ "$retention_days" -gt 0 ]; then
  find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' -mtime "+$retention_days" -exec rm -rf {} \;
  printf 'Expired backups older than %s days were pruned.\n' "$retention_days"
fi
