#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${BACKUP_DIR:?Set an absolute backup directory outside this checkout}"
[[ "$BACKUP_DIR" = /* ]] || { echo 'BACKUP_DIR must be absolute' >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
backup_path="$BACKUP_DIR/karyanesia-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f "$backup_path.partial"' EXIT
docker compose exec -T postgres pg_dump -U karyanesia -d karyanesia -Fc --no-owner --no-privileges > "$backup_path.partial"
[[ -s "$backup_path.partial" ]]
mv "$backup_path.partial" "$backup_path"
sha256sum "$backup_path" > "$backup_path.sha256"
printf 'Backup completed: %s\n' "$backup_path"
