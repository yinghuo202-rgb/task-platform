#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
[ -f "$project_dir/.env" ] && { set -a; . "$project_dir/.env"; set +a; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=${BACKUP_DATA_PATH:-"$project_dir/data/backups"}
upload_dir=${UPLOAD_DATA_PATH:-"$project_dir/data/uploads"}
journal_dir=${JOURNAL_IMPORT_PATH:-"$project_dir/data/journal-import"}
target="$backup_dir/$stamp"

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
