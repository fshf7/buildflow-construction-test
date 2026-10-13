-- Инварианты безопасности для ВСЕХ объектов схемы (в том числе будущих): RLS, гранты, search_path,
-- ограничитель частоты (Д-80), health (Д-84).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
$$, 'RLS включён на всех таблицах public');

select is_empty($$
  select table_name, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
$$, 'у anon нет грантов ни на одну таблицу или представление public');

select is_empty($$
  select table_name from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
$$, 'у authenticated нет TRUNCATE/REFERENCES/TRIGGER');

select is_empty($$
  select table_name from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'DELETE'
    -- Исключения (Foundation): структура объекта правится управляющим под RLS projects.manage;
    -- блок/этаж, на который ссылается документ, не удалить — внешние ключи.
    and table_name not in ('blocks', 'floors')
$$, 'клиент не удаляет напрямую (Д-58), кроме блоков и этажей объекта');

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=""'], false)
$$, 'все SECURITY DEFINER функции с пустым search_path');

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('health')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
$$, 'anon не вызывает функции public, кроме health');

select ok(not has_function_privilege('authenticated', 'public.rate_limit_hit(text,int,int)', 'execute'),
          'ограничитель вызывает только сервер (не authenticated)');
select ok(not has_table_privilege('authenticated', 'private.rate_limits', 'select'), 'счётчики закрыты');

-- Ограничитель: 3 попытки в окне, четвёртая — отказ; другой ключ независим.
select is(array(select public.rate_limit_hit('login_ip:' || repeat('a', 64), 3, 60) from generate_series(1, 4)),
          array[true, true, true, false], 'лимит окна: 3 разрешены, 4-я — нет');
select ok(public.rate_limit_hit('login_ip:' || repeat('b', 64), 3, 60), 'другой ключ — свой счётчик');
select throws_ok($$ select public.rate_limit_hit('login_ip:admin@example.com', 3, 60) $$, '23514', null,
                 'открытый email в ключе не принимается (только sha256)');

select * from finish();
rollback;
