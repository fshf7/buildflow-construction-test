# Почта через Resend (SMTP для Supabase Auth)

> Без своего SMTP Supabase отправляет не больше 2 писем в час и не даёт менять шаблоны. Стандартные письма
> ведут на ссылку, которую приложение не принимает (оно ждёт `token_hash` из наших шаблонов), поэтому
> **приглашения и восстановление пароля работают только после этой настройки**. Ключ вводите вы — в дашборде
> Supabase; в чат и файлы его не пишите.

## 1. Аккаунт и домен в Resend
1. Зарегистрируйтесь на https://resend.com (бесплатно: 3 000 писем в месяц, 100 в день).
2. **Domains → Add Domain**. Лучше поддомен для почты, например `mail.<ваш-домен>` — основная почта домена не затрагивается.
   Регион — ближайший (eu-west-1).
3. Resend покажет DNS-записи. Добавьте их у регистратора домена (раздел DNS):
   - **MX** для `send.mail.<домен>` → значение из Resend, приоритет 10 (нужна для возвратов);
   - **TXT** (SPF) для `send.mail.<домен>` → `v=spf1 include:amazonses.com ~all` (точное значение — из Resend);
   - **TXT** (DKIM) `resend._domainkey.mail.<домен>` → длинный ключ из Resend;
   - по желанию **TXT** (DMARC) `_dmarc.<домен>` → `v=DMARC1; p=none; rua=mailto:<ваш-email>`.
4. Нажмите **Verify DNS Records**. Обычно 5–30 минут, иногда до суток. Статус должен стать **Verified**.

## 2. API-ключ
1. **API Keys → Create API Key**: имя `buildflow-staging-smtp`, Permission **Sending access**, Domain — ваш домен.
2. Скопируйте ключ (`re_…`) — он показывается один раз. Никуда не сохраняйте, сразу шаг 3.
   Для production — отдельный ключ (`buildflow-production-smtp`).

## 3. Supabase → SMTP
Проект `construction` (staging) → **Authentication → Emails → SMTP Settings → Enable Custom SMTP**:

| Поле | Значение |
|---|---|
| Sender email | `noreply@mail.<домен>` (адрес на подтверждённом домене) |
| Sender name | `BuildFlow` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | ключ `re_…` из шага 2 |
| Minimum interval | `30` секунд |

**Save**. Затем **Authentication → Rate Limits → Rate limit for sending emails**: `30` в час (пилот; можно больше).

## 4. Скажите мне «SMTP готов» — дальше сделаю я
- загружу русские шаблоны писем (`supabase/templates/invite.html`, `recovery.html`) через Management API;
- проверю: настройки SMTP видны (без ключа), письмо-приглашение и восстановление пароля приходят на адрес,
  который вы назовёте, ссылка открывает staging и ведёт на установку пароля;
- приглашения снова станут основным способом добавить участника (скрипт без письма, Д-78, — только на крайний случай).

## Проверка доставки, если письма не приходят
- Resend → **Emails**: письмо есть? статус `delivered` / `bounced`;
- папка «Спам» — пока у домена нет истории отправки, это нормально первые дни; DMARC помогает;
- Supabase → **Logs → Auth**: ошибки SMTP (неверный ключ, неподтверждённый домен отправителя).
