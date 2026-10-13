#!/usr/bin/env bash
# Первая организация на STAGING без SMTP (Д-78). Запускает сам будущий администратор в своём терминале:
# пароль вводится скрыто; ключ Supabase берётся из CLI в переменную процесса и нигде не печатается.
# bash scripts/staging-org-create.sh "BuildFlow Demo" officialmanuchehr@gmail.com "ФИО администратора"
set -euo pipefail
REF=rcinzvflyzjusvrtcivb
cd "$(dirname "$0")/.."
[[ $# -eq 3 ]] || { echo "Использование: $0 \"Организация\" email \"ФИО\""; exit 1; }

export NEXT_PUBLIC_APP_ENV=staging
export NEXT_PUBLIC_SUPABASE_URL="https://$REF.supabase.co"
export NEXT_PUBLIC_SITE_URL="https://buildflow-construction-staging.vercel.app"
SUPABASE_SECRET_KEY=$(npx supabase projects api-keys --project-ref "$REF" --reveal -o json </dev/null 2>/dev/null \
  | jq -r '.[] | select(.type=="secret") | .api_key')
[[ -n "$SUPABASE_SECRET_KEY" ]] || { echo "Не удалось получить ключ (npx supabase login?)"; exit 1; }
export SUPABASE_SECRET_KEY

node scripts/org-create.mts --name "$1" --admin-email "$2" --admin-name "$3" --yes --prompt-password
