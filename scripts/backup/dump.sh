#!/usr/bin/env bash
# Дамп БД Supabase (Д-82): роли, схема, все данные (с auth и storage) + отдельно данные приложения
# (public, private) для автоматической проверки восстановления; число строк и сверка источника.
# Использование: DB_URL=… [SRC_PSQL="psql …"] bash scripts/backup/dump.sh <каталог>
# DB_URL — с закодированным паролем (scripts/ci/normalize-db-url.py). Значение не печатается.
set -euo pipefail
trap 'echo "Ошибка (код $?) в строке $LINENO: $BASH_COMMAND" >&2' ERR

out=${1:?каталог}
here=$(cd "$(dirname "$0")" && pwd)
: "${DB_URL:?не задан DB_URL}"
mkdir -p "$out"
SB="npx --yes supabase@${SUPABASE_CLI_VERSION:-2.108.0}"
command -v supabase >/dev/null && SB=supabase
export DO_NOT_TRACK=1

$SB db dump --db-url "$DB_URL" --role-only -f "$out/roles.sql"
$SB db dump --db-url "$DB_URL" -f "$out/schema.sql"
$SB db dump --db-url "$DB_URL" --data-only --use-copy -f "$out/data.sql"
$SB db dump --db-url "$DB_URL" --data-only --use-copy -s public,private -f "$out/data-app.sql"

psql_src() { if [[ -n "${SRC_PSQL:-}" ]]; then $SRC_PSQL "$@"; else psql "$DB_URL" "$@"; fi; }
psql_src -X -At -F $'\t' -v ON_ERROR_STOP=1 -f - < "$here/sql/table-counts.sql" > "$out/counts.tsv"
psql_src -X -At -F $'\t' -v ON_ERROR_STOP=1 -f - < "$here/sql/reconcile.sql" > "$out/reconcile-source.tsv"

if awk -F'\t' '$2 != 0 { bad = 1 } END { exit !bad }' "$out/reconcile-source.tsv"; then
  echo "Источник НЕ сходится (до бэкапа):" >&2; cat "$out/reconcile-source.tsv" >&2; exit 1
fi
for f in roles schema data data-app; do
  [[ -s "$out/$f.sql" || $f == roles ]] || { echo "Пустой файл $f.sql" >&2; exit 1; }
done
echo "Дамп готов: таблиц $(wc -l < "$out/counts.tsv"), строк $(awk -F'\t' '{s += $2} END {print s}' "$out/counts.tsv"), размер $(du -sh "$out" | cut -f1)."
