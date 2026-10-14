# Настройка окружения (staging / production)

> Пошагово, как настраивался staging 13.10.2026; production — так же, в отдельном проекте Supabase (Free, Д-79).
> Секреты передаются только через stdin/скрытый ввод, в чат и файлы не попадают.

## 0. Что нужно
- Supabase CLI (`npx supabase`), вход: `npx supabase login` (для второго аккаунта — `--profile prod`).
- Vercel CLI (`npx vercel@63.1.2`), вход; GitHub CLI `gh` (аккаунт officialmanuchehr).

## 1. Supabase
1. Проект создаёт владелец (регион — ближайший к пользователям; staging — ap-south-1).
2. Проверка, что БД пустая: `npx supabase link --project-ref <ref>`, затем
   `npx supabase db dump --linked --schema public -f /tmp/public.sql` — объектов нет. Иначе — стоп.
3. Миграции (запись в БД — только с явного «да» владельца): `npx supabase db push --linked --yes`;
   `npx supabase migration list --linked` — локальные = удалённые.
4. Auth (Management API, `PATCH /v1/projects/<ref>/config/auth`): `site_url`, `uri_allow_list` = домен окружения,
   `disable_signup = true`. После SMTP — шаблоны писем (`docs/SMTP_RESEND.md`).
5. Ключи — из CLI сразу в Vercel (stdin): `npx supabase projects api-keys --project-ref <ref> --reveal -o json`.

## 2. Vercel
1. `npx vercel@63.1.2 project add buildflow-<env>`; `vercel link --project buildflow-<env>` (удалить из `.env.local`
   добавленный CLI `VERCEL_OIDC_TOKEN`).
2. Настройки проекта (`vercel api /v9/projects/<name> -X PATCH`): `framework: nextjs`, `nodeVersion: 22.x`,
   `serverlessFunctionRegion` — рядом с БД (staging: `bom1`).
3. Домен `.vercel.app` (`POST /v10/projects/<name>/domains`), имя проверить на занятость.
4. Переменные (Production этого проекта), значения — stdin:
   `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL` (корень `https://<ref>.supabase.co`,
   без `/rest/v1`), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`--type config`), `SUPABASE_SECRET_KEY` (`--sensitive`),
   при наличии — `NEXT_PUBLIC_SENTRY_DSN`. Автодеплой из Git выключен (`vercel.json`).

## 3. GitHub environment `<env>`
- Переменные: `NEXT_PUBLIC_APP_ENV`, `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL` (workflow сверяет с ними
  строку подключения и переменные Vercel — защита от деплоя «не туда»).
- Секреты: `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (из `.vercel/project.json`, stdin); `VERCEL_TOKEN`,
  `<ENV>_DB_URL` (Session pooler, пароль БД), `BACKUP_PASSPHRASE` — задаёт владелец:
  ```bash
  read -rs -p "Пароль БД: " P; echo
  printf 'postgresql://postgres.<ref>:%s@<pooler-host>:5432/postgres' "$P" | gh secret set <ENV>_DB_URL --env <env> --repo officialmanuchehr/construction; unset P
  gh secret set BACKUP_PASSPHRASE --env <env> --repo officialmanuchehr/construction
  ```
- Переменная репозитория `<ENV>_APP_URL` — для uptime.
- Включение деплоя: `STAGING_ENABLED=true` / `PRODUCTION_ENABLED=true` (production — только решением владельца).

## 4. Первый администратор
- С SMTP: `npm run org:create -- --name … --admin-email … --admin-name … --yes` (env окружения) — письмо-приглашение.
- Без SMTP (Д-78): `bash scripts/staging-org-create.sh "Организация" email "ФИО"` — пароль вводит сам администратор.

## 5. Проверка
- `curl https://<домен>/api/health` → `{"status":"ok","db":"ok",…}`;
- smoke: `E2E_BASE_URL=… E2E_SUPABASE_URL=… E2E_SUPABASE_PUBLISHABLE_KEY=… npx playwright test -c playwright.smoke.config.ts`;
- сверка на удалённой БД — `scripts/backup/sql/reconcile.sql` (всё 0);
- Actions → Backup → Run workflow — зелёный, с проверкой восстановления.
