#!/usr/bin/env bash
# Секреты и переменные окружений GitHub (staging, production) для deploy-staging.yml / deploy-production.yml.
# Значения вводятся ТОЛЬКО здесь, в терминале: секреты — скрытым вводом gh (ничего не пишется в файлы и историю).
# Запуск: bash scripts/set-env-secrets.sh            — оба окружения
#         bash scripts/set-env-secrets.sh staging    — только одно
# Пустой ввод переменной (Enter) — пропустить. Повторный запуск перезаписывает значения.
set -euo pipefail

REPO="officialmanuchehr/construction"
if [[ $# -eq 0 ]]; then set -- staging production; fi
ENVS=("$@")

hint() { printf '\n\033[1m%s\033[0m\n%s\n' "$1" "$2"; }

secret() { # имя окружение подсказка
  hint "[$2] секрет $1" "$3"
  gh secret set "$1" --env "$2" --repo "$REPO"
}

variable() { # имя окружение подсказка
  hint "[$2] переменная $1" "$3"
  read -r -p "Значение (Enter — пропустить): " value
  if [[ -n "$value" ]]; then
    gh variable set "$1" --env "$2" --repo "$REPO" --body "$value"
  else
    echo "Пропущено."
  fi
}

gh auth status >/dev/null 2>&1 || { echo "Сначала: gh auth login"; exit 1; }

for env in "${ENVS[@]}"; do
  case "$env" in
    staging) DB_SECRET=STAGING_DB_URL ;;
    production) DB_SECRET=PRODUCTION_DB_URL ;;
    *) echo "Неизвестное окружение: $env"; exit 1 ;;
  esac
  printf '\n========== Окружение %s ==========\n' "$env"

  gh variable set NEXT_PUBLIC_APP_ENV --env "$env" --repo "$REPO" --body "$env"
  echo "Переменная NEXT_PUBLIC_APP_ENV=$env задана."

  variable SUPABASE_PROJECT_REF "$env" \
    "Supabase → проект ($env) → Project Settings → General → Project ID (20 букв, например abcdefghijklmnopqrst)."
  variable NEXT_PUBLIC_SUPABASE_URL "$env" \
    "Supabase → проект ($env) → Project Settings → Data API → Project URL (https://<ref>.supabase.co). Должен совпадать с переменной в Vercel."

  secret "$DB_SECRET" "$env" \
    "Supabase → проект ($env) → кнопка Connect → Session pooler (IPv4!) → URI с паролем БД:
postgresql://postgres.<ref>:<пароль>@aws-0-<регион>.pooler.supabase.com:5432/postgres
Пароль — Project Settings → Database → Database password (при необходимости Reset)."
  secret VERCEL_TOKEN "$env" \
    "Vercel → Account Settings → Tokens → Create Token (scope — команда проекта; срок — по политике)."
  secret VERCEL_ORG_ID "$env" \
    "Vercel → Team Settings → General → Team ID (team_…); для личного аккаунта — Account Settings → General → Vercel ID.
Или: vercel link в каталоге проекта → .vercel/project.json, поле orgId."
  secret VERCEL_PROJECT_ID "$env" \
    "Vercel → проект ($( [[ $env == staging ]] && echo buildflow-staging || echo production-проект )) → Settings → General → Project ID (prj_…)."
done

cat <<'MSG'

Готово. Не в GitHub, а в других местах задаются:
- Vercel (Production выбранного проекта): NEXT_PUBLIC_APP_ENV, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY (Sensitive).
- Resend API key — в Supabase → Authentication → Emails → SMTP Settings (host smtp.resend.com, user resend).
Включение деплоя — переменные репозитория: STAGING_ENABLED=true / PRODUCTION_ENABLED=true (только когда всё задано).
MSG
