-- Базовые инварианты схемы. Выполняется `npm run db:test` (supabase test db) на чистой БД.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select has_extension('pgcrypto', 'pgcrypto установлен');
select has_extension('btree_gist', 'btree_gist установлен');

-- Правило CLAUDE.md: каждая таблица public — с включённым RLS.
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'RLS включён на всех таблицах схемы public'
);

select * from finish();
rollback;
