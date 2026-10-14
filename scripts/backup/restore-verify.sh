#!/usr/bin/env bash
# Проверка бэкапа восстановлением (Д-82): чистый Postgres того же образа Supabase (временный проект
# bf-restore, другие порты) ← схема + данные приложения; затем число строк = как в источнике и сверка = 0.
# Использование: bash scripts/backup/restore-verify.sh <каталог дампа>
set -euo pipefail
trap 'echo "Ошибка (код $?) в строке $LINENO: $BASH_COMMAND" >&2' ERR

dump=$(cd "${1:?каталог дампа}" && pwd)
root=$(cd "$(dirname "$0")/../.." && pwd)
here="$root/scripts/backup"
SB="npx --yes supabase@${SUPABASE_CLI_VERSION:-2.108.0}"
command -v supabase >/dev/null && SB=supabase
export DO_NOT_TRACK=1

# Временный проект: тот же config.toml, без миграций (восстанавливаем «как из бэкапа»), другие порты.
tmp=$(mktemp -d)
cleanup() { $SB stop --workdir "$tmp" --no-backup >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
mkdir -p "$tmp/supabase"
sed -e 's/^project_id = .*/project_id = "bf-restore"/' \
    -e 's/= 5442\([0-9]\)/= 5453\1/' "$root/supabase/config.toml" > "$tmp/supabase/config.toml"
cp -R "$root/supabase/templates" "$tmp/supabase/" 2>/dev/null || true
# Нужна только БД; проверку готовности CLI (через исключённый Kong) пропускаем — ждём саму БД.
$SB start --workdir "$tmp" --ignore-health-check \
  -x analytics,edge-runtime,functions,imgproxy,inbucket,kong,meta,realtime,rest,storage,studio,vector >/dev/null
db="supabase_db_bf-restore"
for _ in $(seq 1 60); do docker exec "$db" pg_isready -U postgres -q && break; sleep 2; done
docker exec "$db" pg_isready -U postgres -q || { echo "Временная БД не поднялась" >&2; exit 1; }
psql_r() { docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

started=$(date +%s)
[[ -s "$dump/roles.sql" ]] && psql_r -q -f - < "$dump/roles.sql" >/dev/null
psql_r -q --single-transaction -f - < "$dump/schema.sql" >/dev/null
{ echo "set session_replication_role = replica;"; cat "$dump/data-app.sql"; } | psql_r -q --single-transaction -f - >/dev/null
seconds=$(( $(date +%s) - started ))

psql_r -At -F $'\t' -f - < "$here/sql/table-counts.sql" > "$dump/counts-restored.tsv"
psql_r -At -F $'\t' -f - < "$here/sql/reconcile.sql" > "$dump/reconcile-restored.tsv"

if ! diff -u "$dump/counts.tsv" "$dump/counts-restored.tsv" > "$dump/counts.diff"; then
  echo "Число строк после восстановления отличается:" >&2; cat "$dump/counts.diff" >&2; exit 1
fi
if awk -F'\t' '$2 != 0 { bad = 1 } END { exit !bad }' "$dump/reconcile-restored.tsv"; then
  echo "Сверка после восстановления НЕ сходится:" >&2; cat "$dump/reconcile-restored.tsv" >&2; exit 1
fi
echo "Восстановление проверено за ${seconds} с: таблиц $(wc -l < "$dump/counts-restored.tsv"), строк $(awk -F'\t' '{s += $2} END {print s}' "$dump/counts-restored.tsv") — совпадает; сверка: 0 расхождений."
