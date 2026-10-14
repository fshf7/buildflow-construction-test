#!/usr/bin/env bash
# Первая организация на STAGING (Д-78, Д-87): писем нет. Запускает сам будущий администратор в своём терминале:
# пароль вводится скрыто; ключ Supabase берётся из CLI в переменную процесса и нигде не печатается.
# bash scripts/staging-org-create.sh "BuildFlow Demo" "+992XXXXXXXXX | имя | email" "ФИО администратора"
set -euo pipefail

# Любая неожиданная ошибка — с сообщением, а не молчаливый код 1.
trap 'code=$?; echo "Ошибка (код $code) в строке $LINENO: $BASH_COMMAND" >&2; exit $code' ERR

REF=rcinzvflyzjusvrtcivb
cd "$(dirname "$0")/.."
[[ $# -eq 3 ]] || { echo "Использование: $0 \"Организация\" логин \"ФИО\"" >&2; exit 1; }
command -v jq >/dev/null || { echo "Нужен jq (brew install jq)" >&2; exit 1; }
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' \
  || { echo "Нужен Node 22+: source ~/.nvm/nvm.sh && nvm use 22" >&2; exit 1; }

export NEXT_PUBLIC_APP_ENV=staging
export NEXT_PUBLIC_SUPABASE_URL="https://$REF.supabase.co"
export NEXT_PUBLIC_SITE_URL="https://buildflow-construction-staging.vercel.app"

# Ключ: stdout CLI → переменная (не печатается). stderr CLI ключей не содержит — показываем его при сбое.
# Раньше stderr уходил в /dev/null, а сбой CLI под set -e/pipefail обрывал скрипт молча с кодом 1.
# Телеметрия CLI выключена: её отправка при выходе иногда падает по таймауту и даёт ненулевой код.
err=$(mktemp)
trap 'rm -f "$err"' EXIT
# «|| cli_code=$?» — сбой CLI не обрывает скрипт и не вызывает trap ERR: разбираем его ниже.
cli_code=0
keys=$(DO_NOT_TRACK=1 npx --yes supabase projects api-keys --project-ref "$REF" --reveal -o json </dev/null 2>"$err") \
  || cli_code=$?
SUPABASE_SECRET_KEY=$(printf '%s' "$keys" | jq -r '.[]? | select(.type=="secret") | .api_key' 2>/dev/null || true)
unset keys
if [[ -z "$SUPABASE_SECRET_KEY" ]]; then
  echo "Не удалось получить секретный ключ Supabase (код CLI $cli_code)." >&2
  echo "Проверьте вход: npx supabase login. Сообщение CLI:" >&2
  sed 's/^/  /' "$err" >&2
  exit 1
fi
if [[ $cli_code -ne 0 ]]; then
  echo "Предупреждение: Supabase CLI завершился с кодом $cli_code, но ключ получен — продолжаем." >&2
fi
export SUPABASE_SECRET_KEY

# org-create сам печатает понятную ошибку — без второго сообщения от trap.
node scripts/org-create.mts --name "$1" --admin-login "$2" --admin-name "$3" --yes --prompt-password || exit $?
