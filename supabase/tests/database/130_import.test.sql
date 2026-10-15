-- Импорт справочников (Д-85): всё или ничего, повтор ключа, пропустить/обновить, права, ошибки строк.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
-- ---- Общая фикстура фазы 2 (одинакова в 030/040/050) ----
create function pg_temp.mk_user(p_email text) returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          p_email, '', now(), '{}', '{}', now(), now())
  returning id
$$;

-- Вход: настоящая сессия + session_id в JWT (Д-47).
create function pg_temp.login(p_user uuid, p_aal text default 'aal1') returns void language plpgsql as $$
declare
  v_session uuid := gen_random_uuid();
begin
  execute 'reset role';
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  values (v_session, p_user, now(), now(), p_aal::auth.aal_level);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'session_id', v_session)::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Текст detail ошибки (для проверки «ошибка показывает текущий остаток»).
create function pg_temp.err_detail(p_sql text) returns jsonb language plpgsql as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end $$;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;

insert into ids values
  ('admin', pg_temp.mk_user('admin@t.local')), ('acc', pg_temp.mk_user('acc@t.local')),
  ('wh', pg_temp.mk_user('wh@t.local')), ('foreman', pg_temp.mk_user('foreman@t.local')),
  ('foreman2', pg_temp.mk_user('foreman2@t.local')), ('pm', pg_temp.mk_user('pm@t.local'));
insert into ids select 'org', public.create_organization('Стройка', pg_temp.id('admin'), 'Админ', 'admin@t.local');

-- Участники и объект (как администратор со вторым фактором).
select pg_temp.login(pg_temp.id('admin'), 'aal2');
insert into public.projects (organization_id, code, name) values (pg_temp.id('org'), 'P1', 'ЖК Восток');
insert into ids select 'p1', id from public.projects where code = 'P1';
insert into public.blocks (organization_id, project_id, name) values (pg_temp.id('org'), pg_temp.id('p1'), 'Блок А');
insert into ids select 'block', id from public.blocks where name = 'Блок А';
insert into public.floors (organization_id, project_id, block_id, name)
  values (pg_temp.id('org'), pg_temp.id('p1'), pg_temp.id('block'), '1');
insert into ids select 'floor', id from public.floors where name = '1';
select public.add_member(pg_temp.id('org'), pg_temp.id('acc'), 'acc@t.local', 'Бухгалтер', array['accountant'], true, '{}');
select public.add_member(pg_temp.id('org'), pg_temp.id('wh'), 'wh@t.local', 'Склад', array['warehouse'], false,
  array[pg_temp.id('p1')]);
select public.add_member(pg_temp.id('org'), pg_temp.id('foreman'), 'foreman@t.local', 'Прораб', array['foreman'], false,
  array[pg_temp.id('p1')]);
select public.add_member(pg_temp.id('org'), pg_temp.id('foreman2'), 'foreman2@t.local', 'Прораб 2', array['foreman'],
  false, array[pg_temp.id('p1')]);
select public.add_member(pg_temp.id('org'), pg_temp.id('pm'), 'pm@t.local', 'Управляющий', array['project_manager'],
  false, array[pg_temp.id('p1')]);
insert into ids select 'kg', id from public.units_of_measure where code = 'кг' and organization_id = pg_temp.id('org');
insert into ids select 'bag', id from public.units_of_measure where code = 'меш' and organization_id = pg_temp.id('org');
select pg_temp.logout();

-- Справочники (как бухгалтер) и бригада (как прораб — crews.manage).
select pg_temp.login(pg_temp.id('acc'), 'aal2');
insert into public.materials (organization_id, name, unit_id) values
  (pg_temp.id('org'), 'Цемент', pg_temp.id('kg')), (pg_temp.id('org'), 'Песок', pg_temp.id('kg')),
  (pg_temp.id('org'), 'Гипс', pg_temp.id('kg'));
insert into ids select 'cement', id from public.materials where name = 'Цемент';
insert into ids select 'sand', id from public.materials where name = 'Песок';
insert into ids select 'gypsum', id from public.materials where name = 'Гипс';
insert into public.suppliers (organization_id, name) values (pg_temp.id('org'), 'ООО Цемент'), (pg_temp.id('org'), 'ООО Песок');
insert into ids select 's1', id from public.suppliers where name = 'ООО Цемент';
insert into ids select 's2', id from public.suppliers where name = 'ООО Песок';
select pg_temp.logout();

select pg_temp.login(pg_temp.id('foreman'));
insert into public.crews (organization_id, name, foreman_member_id)
  select pg_temp.id('org'), 'Бригада Каримова', m.id from public.organization_members m
  where m.user_id = pg_temp.id('foreman');
insert into ids select 'crew', id from public.crews where name = 'Бригада Каримова';
select pg_temp.logout();

-- Заявка склада (Д-92): цемент 20 кг, песок 10 кг — без поставщиков и цен (их нет в заявке).
select pg_temp.login(pg_temp.id('wh'));
insert into ids values ('req', gen_random_uuid());
select public.save_purchase_request_draft(pg_temp.id('req'), pg_temp.id('p1'), null, 'TJS', null,
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 20),
    jsonb_build_object('material_id', pg_temp.id('sand'), 'quantity', 10)));
insert into ids select 'req_cement', id from public.purchase_request_items where material_id = pg_temp.id('cement');
insert into ids select 'req_sand', id from public.purchase_request_items where material_id = pg_temp.id('sand');
select pg_temp.logout();
-- ---- конец фикстуры ----
create function pg_temp.imp(p_user text, p_kind text, p_rows jsonb, p_mode text default 'skip', p_key uuid default gen_random_uuid())
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.login(pg_temp.id(p_user), case when p_user in ('acc', 'admin') then 'aal2' else 'aal1' end);
  v := public.import_catalog(pg_temp.id('org'), p_kind, p_key, p_rows, p_mode);
  perform pg_temp.logout();
  return v;
end $$;
create function pg_temp.mcount() returns bigint language sql as $$
  select count(*) from public.materials where organization_id = pg_temp.id('org') $$;

-- Материалы: создание; повтор с тем же ключом — без дублей.
insert into ids values ('k1', gen_random_uuid());
select is(pg_temp.imp('acc', 'materials', '[{"row":2,"name":"Кирпич М150","unit_code":"шт","category":"Стеновые"},
  {"row":3,"name":"Щебень 20-40","unit_code":"т","code":"SH-2040"}]', 'skip', pg_temp.id('k1')),
  '{"created":2,"updated":0,"skipped":0}'::jsonb, 'создано 2 материала');
select is(pg_temp.imp('acc', 'materials', '[{"row":2,"name":"Кирпич М150","unit_code":"шт"},
  {"row":3,"name":"Щебень 20-40","unit_code":"т","code":"SH-2040"}]', 'skip', pg_temp.id('k1')),
  '{"created":2,"updated":0,"skipped":0}'::jsonb, 'повтор с тем же ключом — сохранённый ответ');
select is(pg_temp.mcount(), 5::bigint, 'дублей нет (3 из фикстуры + 2)');

-- Совпадение без учёта регистра и пробелов; «пропустить» и «обновить».
select is(pg_temp.imp('acc', 'materials', '[{"row":2,"name":"  кирпич   м150 ","unit_code":"шт"}]'),
  '{"created":0,"updated":0,"skipped":1}'::jsonb, 'существующий пропущен');
select is(pg_temp.imp('acc', 'materials', '[{"row":2,"name":"Щебень фр. 20-40","unit_code":"кг","code":"sh-2040","category":"Сыпучие"}]', 'update'),
  '{"created":0,"updated":1,"skipped":0}'::jsonb, 'по коду найден и обновлён');
select results_eq($$ select m.name, m.category, u.code from public.materials m join public.units_of_measure u on u.id = m.unit_id
                     where m.code = 'SH-2040' $$,
  $$ values ('Щебень фр. 20-40'::text, 'Сыпучие'::text, 'т'::text) $$, 'название и категория обновлены, единица — нет');

-- Ошибки строк: ничего не записано, в detail — номера строк.
select throws_ok($$ select pg_temp.imp('acc', 'materials', '[{"row":2,"name":"","unit_code":"шт"},
  {"row":3,"name":"Гвозди","unit_code":"ящ"},{"row":4,"name":"Песок мытый","unit_code":"т"},{"row":5,"name":"песок  МЫТЫЙ","unit_code":"т"}]') $$,
  'P0001', 'BF_IMPORT_INVALID', 'строки с ошибками — отказ целиком');
select is(pg_temp.mcount(), 5::bigint, 'ничего не записано');
select is((select jsonb_agg((e ->> 'row')::int order by (e ->> 'row')::int) from jsonb_array_elements(
  pg_temp.err_detail($$ select pg_temp.imp('acc', 'materials', '[{"row":2,"name":"","unit_code":"шт"},
  {"row":3,"name":"Гвозди","unit_code":"ящ"},{"row":4,"name":"Песок мытый","unit_code":"т"},{"row":5,"name":"песок  МЫТЫЙ","unit_code":"т"}]') $$)) e),
  '[2, 3, 5]'::jsonb, 'ошибки по строкам: пустое название, неизвестная единица, повтор в файле');

-- Поставщики: по ИНН.
select is(pg_temp.imp('acc', 'suppliers', '[{"row":2,"name":"ООО Бетон","tax_id":"0123456789","phone":"+992 900 11 22 33"}]'),
  '{"created":1,"updated":0,"skipped":0}'::jsonb, 'поставщик создан');
select is(pg_temp.imp('acc', 'suppliers', '[{"row":2,"name":"ООО «Бетон-Сервис»","tax_id":"0123456789","address":"Душанбе"}]', 'update'),
  '{"created":0,"updated":1,"skipped":0}'::jsonb, 'найден по ИНН и обновлён');
select results_eq($$ select name, phone, address from public.suppliers where tax_id = '0123456789' $$,
  $$ values ('ООО «Бетон-Сервис»'::text, '+992 900 11 22 33'::text, 'Душанбе'::text) $$, 'пустые поля не затирают заполненные');

-- Бригады: прораб по email; права.
select is(pg_temp.imp('foreman', 'crews', '[{"row":2,"name":"Бригада Юсупова","leader_name":"Юсупов","foreman_email":"FOREMAN@t.local"}]'),
  '{"created":1,"updated":0,"skipped":0}'::jsonb, 'прораб импортирует бригады');
select is((select m.email from public.crews c join public.organization_members m on m.id = c.foreman_member_id
           where c.name = 'Бригада Юсупова'), 'foreman@t.local', 'ответственный прораб найден по email');
select throws_ok($$ select pg_temp.imp('foreman', 'crews', '[{"row":2,"name":"Бригада Икс","foreman_email":"acc@t.local"}]') $$,
  'P0001', 'BF_IMPORT_INVALID', 'email не прораба — ошибка строки');
select throws_ok($$ select pg_temp.imp('foreman', 'materials', '[{"row":2,"name":"Цемент","unit_code":"кг"}]') $$,
  '42501', 'BF_FORBIDDEN', 'прораб не импортирует материалы');
select throws_ok($$ select pg_temp.imp('wh', 'suppliers', '[{"row":2,"name":"Х"}]') $$,
  '42501', 'BF_FORBIDDEN', 'склад не импортирует поставщиков');
select throws_ok($$ select pg_temp.imp('acc', 'materials', '[]') $$, 'P0001', 'BF_IMPORT_SIZE', 'пустой импорт');

select * from finish();
rollback;
