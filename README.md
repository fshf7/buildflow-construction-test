# BuildFlow

Учёт материальных и денежных потоков строительной компании: объекты, склады, закупки, касса, бригады, задачи.
Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage, RLS), деплой на Vercel.

- ТЗ: [docs/TZ_v0.9.pdf](docs/TZ_v0.9.pdf)
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
cp .env.example .env.local       # вставьте PUBLISHABLE_KEY и SECRET_KEY из `npx supabase status -o env`
npm run db:reset                 # миграции + локальные данные (scripts/seed-local.mts)
npm run dev                      # http://localhost:3000
```

> Не держите проект в iCloud (`~/Desktop`, `~/Documents` при включённой синхронизации): iCloud выгружает файлы
> `node_modules`, и сборка зависает.

Локальные учётные записи (организация «Демо-стройка»), только в локальной БД:

| Email | Пароль | Роль | MFA |
|---|---|---|---|
| `admin@buildflow.local` | `buildflow-local` | Администратор организации | обязательна: при первом входе подключите TOTP-приложение |
| `foreman@buildflow.local` | `buildflow-local` | Прораб | нет |
| `accountant@buildflow.local` | `buildflow-local` | Материальный бухгалтер | обязательна |
| `storekeeper@buildflow.local` | `buildflow-local` | Заведующий складом | нет |
| `cashier@buildflow.local` | `buildflow-local` | Кассир | обязательна |

Seed создаёт и демо-объект `DEMO — ЖК Демо` (блок, этажи, бригада, материалы, поставщики): кладовщик и прораб
назначены на него — можно сразу пройти заявку → приёмку → выдачу.

Письма (приглашения) локально не уходят наружу — смотрите их в Mailpit: http://127.0.0.1:54424. Studio — http://127.0.0.1:54423.

## Скрипты

| Скрипт | Что делает |
|---|---|
| `dev` / `build` / `start` | Next.js: разработка / сборка / запуск сборки |
| `typecheck` | `tsc --noEmit` (strict) |
| `lint` | ESLint |
| `format` / `format:check` | Prettier (markdown не форматируется) |
| `test` | Vitest — юнит-тесты бизнес-логики |
| `test:integration` | интеграционные тесты против локального Supabase: параллельное проведение, «склад не видит цен» через API |
| `test:e2e` | Playwright (нужны `db:start` и `npx playwright install chromium`) |
| `db:start` / `db:stop` | локальный Supabase |
| `db:reset` | пересоздать локальную БД: все миграции + `seed.sql` + `db:seed:local` |
| `mfa:reset` | сбросить второй фактор пользователю (серверный скрипт, `--yes` обязателен) |
| `db:seed:local` | локальная организация и пользователи (идемпотентно; только локальная БД). `-- --reset-mfa` сбрасывает второй фактор администратора |
| `org:create` | создать организацию и её первого администратора (см. «Организации и участники») |
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

## Организации и участники

Самостоятельной регистрации нет (Д-37, Д-41).

1. **Организация и первый администратор** — только серверным скриптом:
   ```bash
   # локально (пароль сразу, без письма):
   npm run org:create -- --name "СК Восток" --admin-email owner@example.tj --admin-name "Иванов И. И." --password '…'
   # staging/production (письмо-приглашение; --yes подтверждает нелокальную БД):
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> NEXT_PUBLIC_SITE_URL=https://<домен> \
     npm run org:create -- --name "СК Восток" --admin-email owner@example.tj --admin-name "Иванов И. И." --yes
   ```
2. **Остальные участники** — администратор приглашает в разделе «Участники»: роли, объекты, письмо со ссылкой.
   Приглашённый задаёт пароль; бухгалтер, кассир и администратор затем подключают второй фактор (TOTP).
3. В организации всегда остаётся хотя бы один активный администратор (Д-43).
4. **Потерян телефон (второй фактор)**: администратор открывает участника → «Сбросить второй фактор», указывает
   причину. Участник выходит на всех устройствах сразу (Д-47) и при следующем входе подключает MFA заново.
   Себе сбросить нельзя — другой администратор или серверный скрипт:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run mfa:reset -- --email admin@example.tj --reason "Потерян телефон, заявка №…" --yes
   ```
5. **Забыли пароль**: ссылка «Забыли пароль?» на экране входа → письмо → новый пароль. Ответ одинаковый для любого
   email (не раскрывает, есть ли учётная запись); второй фактор новый пароль не отменяет.

## CI

`.github/workflows/ci.yml` на каждый push в `main` и на pull request:
- **app** — typecheck, lint, format:check, Vitest, `next build`;
- **db** — `supabase db reset` на чистой БД, pgTAP, проверка актуальности типов;
- **e2e** — интеграционные тесты и Playwright (десктоп + смартфон) против production-сборки на чистом локальном Supabase с `seed-local`;
  при падении — артефакт `playwright-report` (HTML-отчёт, трейсы, скриншоты, видео) в разделе Actions.

## Окружения и деплой

| | staging | production |
|---|---|---|
| Источник | ветка `main` после зелёного CI | позже (не настроено) |
| Supabase | проект `buildflow-staging` | отдельный проект |
| Vercel | проект `buildflow-staging` (среда Production этого проекта) | отдельный проект |
| `NEXT_PUBLIC_APP_ENV` | `staging` | `production` |
| Данные | без `seed-local`; организации — `npm run org:create --yes` | то же |

### Как выкатывается staging (автоматически)

`.github/workflows/deploy-staging.yml`, после зелёного `CI` на `main`:

1. **migrate** — `supabase db push --db-url $STAGING_DB_URL` применяет новые миграции к staging
   (каждая миграция — в своей транзакции: при ошибке она откатывается целиком, деплой кода не начинается).
2. **deploy** — `vercel build` + `vercel deploy --prebuilt --prod` того же коммита.
   Автодеплой Vercel из Git отключён (`vercel.json`): иначе код мог бы опередить миграции.

Запуск вручную: Actions → Deploy staging → Run workflow. Включение: переменная репозитория `STAGING_ENABLED=true`.

Секреты окружения GitHub `staging`: `STAGING_DB_URL` (Session pooler, IPv4), `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`. Переменные приложения (`NEXT_PUBLIC_*`, `SUPABASE_SECRET_KEY`) — в Vercel (Production этого
проекта); `NEXT_PUBLIC_*` вшиваются при сборке, после их изменения нужен новый деплой.

### Правила миграций (чтобы откат кода был безопасным)

- Миграции **только добавляются**; применённую миграцию не редактируем — исправление = новая миграция.
- **Expand / contract**: сначала расширяем схему (новая колонка/таблица, старое не трогаем), выкатываем код,
  и только следующим релизом удаляем старое. Тогда предыдущая версия кода работает с новой схемой, и код можно
  откатить без отката БД.
- Деструктивные изменения (DROP, смена типа с потерей данных) — только после явного согласования (CLAUDE.md, п. 4).
- В конце каждой миграции — комментарий `-- ROLLBACK:` с SQL, который отменяет её (для аварийной обратной миграции).

### Откат

**Код** (быстро, без изменения БД): Vercel → проект → Deployments → предыдущий деплой → **Instant Rollback**
(или `npx vercel rollback <url> --token …`). Безопасно, если соблюдён expand/contract.

**Миграция** (исправление вперёд):
1. Новая миграция, отменяющая изменение (SQL — из блока `-- ROLLBACK:` исходной миграции):
   `npx supabase migration new revert_<имя>`.
2. Локально: `npm run db:reset && npm run db:test && npm run test:e2e`, затем PR → CI → автоматический `db push` в staging.
3. Если ошибочная миграция уже удалила данные — восстановление из бэкапа (ниже), а не обратной миграцией.

**Миграция упала при применении**: она откатилась целиком (транзакция). Исправьте её файл (она не применилась — это
разрешено), прогоните локально, запушьте — `db push` применит её заново. Проверить состояние:
`npx supabase migration list --db-url "$STAGING_DB_URL"`. Если запись о версии разошлась с реальной схемой (ручные
правки — запрещены, но всё же): `npx supabase migration repair --status reverted <версия> --db-url …`, затем повторный `db push`.

**Данные** (крайний случай): Dashboard → Database → Backups. На бесплатном плане резервных копий нет;
для production — Pro-план с ежедневными бэкапами и PITR, восстановление проверяется до запуска (ТЗ §9, §12).

### Первичная настройка staging (один раз)

1. Supabase: проект `buildflow-staging`; Auth → MFA: TOTP включён; Auth → Sign-ups: выключены.
2. Auth → URL Configuration: Site URL = `https://<домен-staging>`, Redirect URLs = `https://<домен-staging>/**`.
3. Auth → Email Templates: **Invite user** и **Reset password** — из `supabase/templates/invite.html` и
   `recovery.html` (ссылки ведут на `{{ .SiteURL }}/auth/confirm?token_hash=…`).
4. Auth → SMTP: свой SMTP (Resend: `smtp.resend.com:465`, пользователь `resend`, пароль — API-ключ,
   отправитель — адрес на подтверждённом домене). Встроенная почта Supabase шлёт лишь несколько писем в час.
5. Vercel: проект `buildflow-staging`, переменные для Production: `NEXT_PUBLIC_APP_ENV=staging`,
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY` (Sensitive).
6. GitHub: окружение `staging` с секретами выше, переменная `STAGING_ENABLED=true`.
7. Первая организация: `npm run org:create -- … --yes` с env staging (см. «Организации и участники»).

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
