-- 0001: базовые расширения. Схема данных — в следующих миграциях (docs/ARCHITECTURE.md).

-- gen_random_uuid(), crypt() — для PK и сидов.
create extension if not exists pgcrypto with schema extensions;

-- EXCLUDE-ограничения по периодам тарифов бригад (Д-34).
create extension if not exists btree_gist with schema extensions;

-- pgTAP сюда НЕ ставим: тесты создают его в своей транзакции и откатывают (supabase/tests).
