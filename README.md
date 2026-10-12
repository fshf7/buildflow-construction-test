# BuildFlow

Учёт материальных и денежных потоков строительной компании: объекты, склады, закупки, касса, бригады, задачи.
Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage, RLS), деплой на Vercel.

- ТЗ: [docs/TZ_v1.0.pdf](docs/TZ_v1.0.pdf)
- Архитектура данных, статусы, RLS, проведение: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Принятые решения: [docs/DECISIONS.md](docs/DECISIONS.md)
- Правила работы: [CLAUDE.md](CLAUDE.md)

## Требования

- Node.js 22 (`nvm use` — версия в `.nvmrc`)
- Docker Desktop (для локального Supabase)
- Supabase CLI ставится как dev-зависимость (`npx supabase …`), отдельная установка не нужна

## Локальный запуск

```bash
nvm use
npm install
npm run db:start                 # поднимает Supabase в Docker (порты 544xx)
cp .env.example .env.local       # вставьте PUBLISHABLE_KEY из вывода db:start (или `npx supabase status`)
npm run dev                      # http://localhost:3000
```

Вход в локальное приложение: `admin@buildflow.local` / `buildflow-local` — создаётся `npm run db:reset`
(или отдельно `npm run db:seed:local`), только в локальной БД, см. «Seed и окружения».

Полезные адреса: Studio — http://127.0.0.1:54423, почта (Mailpit) — http://127.0.0.1:54424.

## Скрипты

| Скрипт | Что делает |
|---|---|
| `dev` / `build` / `start` | Next.js: разработка / сборка / запуск сборки |
| `typecheck` | `tsc --noEmit` (strict) |
| `lint` | ESLint |
| `format` / `format:check` | Prettier (markdown не форматируется) |
| `test` | Vitest — юнит-тесты бизнес-логики |
| `test:e2e` | Playwright (нужны `db:start` и `npx playwright install chromium`) |
| `db:start` / `db:stop` | локальный Supabase |
| `db:reset` | пересоздать локальную БД: все миграции + `seed.sql` + `db:seed:local` |
| `db:seed:local` | локальный пользователь для разработки и E2E (идемпотентно; только локальная БД) |
| `db:types` | сгенерировать `src/lib/supabase/database.types.ts` — **после каждой миграции** |
| `db:test` | pgTAP-тесты из `supabase/tests` |

## Изменение схемы БД

1. `npx supabase migration new <имя>` → правите SQL в `supabase/migrations/`.
2. `npm run db:reset && npm run db:test && npm run db:types`.
3. Коммитите миграцию и типы вместе — CI проверяет, что типы соответствуют миграциям.

Ручные правки схемы в дашборде Supabase запрещены.

## Переменные окружения

См. [.env.example](.env.example). Публичные переменные проверяются zod-схемой при сборке, серверные — при старте сервера.
`NEXT_PUBLIC_*` вшиваются в клиентский бандл **на этапе сборки**: после их изменения в Vercel нужен новый деплой.
`SUPABASE_SECRET_KEY` — только сервер, никогда с префиксом `NEXT_PUBLIC_`.

## CI

`.github/workflows/ci.yml` на каждый push в `main`/`staging` и на pull request:
- **app** — typecheck, lint, format:check, Vitest, `next build`;
- **db** — `supabase db reset` на чистой БД, pgTAP, проверка актуальности типов.

## Окружения и деплой

| | staging | production |
|---|---|---|
| Ветка | `staging` | `main` |
| Supabase | отдельный проект `buildflow-staging` | отдельный проект `buildflow-prod` |
| Vercel | Preview для ветки `staging` (или Custom Environment «staging») | Production |
| `NEXT_PUBLIC_APP_ENV` | `staging` | `production` |

### Первичная настройка (один раз на окружение)

1. Создать проект Supabase (регион ближе к пользователям) и сразу включить MFA (TOTP) в Auth.
2. Auth → URL Configuration: Site URL = домен окружения, Redirect URLs = `https://<домен>/**`.
   Отключить самостоятельную регистрацию (Sign-ups) — пользователей заводит администратор.
3. В Vercel задать переменные окружения для нужной среды (Production / Preview `staging`):
   `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   при необходимости `SUPABASE_SECRET_KEY` (Sensitive).

### Выкладка

1. Миграции применяются **до** деплоя кода, сначала в staging:
   ```bash
   npx supabase link --project-ref <ref-staging>
   npx supabase db push            # покажет список миграций и попросит подтверждение
   ```
2. Push/merge в `staging` → Vercel собирает preview; проверка руками на staging.
3. Merge `staging` → `main` → `npx supabase link --project-ref <ref-prod> && npx supabase db push` → Vercel деплоит production.
4. После первого production-деплоя миграции только добавляются; деструктивные (DROP, смена типа с потерей данных) —
   только после явного согласования (CLAUDE.md, правило 4).

## Seed и окружения

| Что | Где выполняется | Содержимое |
|---|---|---|
| `supabase/seed.sql` | `supabase db reset` — локально и в CI | только справочные данные, безопасные для любого окружения (сейчас пуст) |
| `scripts/seed-local.mts` (`npm run db:seed:local`) | только локальная БД | тестовый пользователь `admin@buildflow.local` |

Почему тестовый пользователь не попадёт в staging/production:
- его нет в `seed.sql` — поэтому ни `db push --include-seed`, ни Supabase Branching его не создадут;
- скрипт берёт адрес и ключ из `supabase status` (локальный Docker), а не из env, и отказывается работать,
  если адрес не `127.0.0.1`/`localhost` или `NEXT_PUBLIC_APP_ENV` = `staging`/`production` (покрыто тестом
  `scripts/local-supabase.test.mts`).

В staging/production пользователей заводят только `npm run org:create` (первый `org_admin`) и приглашения — появятся в фазе Foundation.
