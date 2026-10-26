-- Правки прогона 26–27.10.2026: этап в выдаче с телефона (нормативы), накладная со ссылкой на заявку,
-- отчёт прихода без поставщика (Д-102).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
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
create function pg_temp.stage(p_name text) returns uuid language sql as $$
  select id from public.work_stages where organization_id = pg_temp.id('org') and name = p_name
$$;
create function pg_temp.cat(p_name text) returns uuid language sql as $$
  select id from public.expense_categories where organization_id = pg_temp.id('org') and name = p_name
$$;
create function pg_temp.invoice(p_id uuid, p_request uuid) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.login(pg_temp.id('acc'), 'aal2');
  v := public.save_supplier_invoice(p_id, gen_random_uuid(), pg_temp.id('p1'), pg_temp.id('s1'), '2026-10-20',
    'Н-1', 'TJS', null,
    jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'), 'category_id',
      pg_temp.cat('Конструктив'), 'quantity', 20, 'price', 2)), p_request);
  perform pg_temp.logout();
  return v;
end $$;

-- ---- 1. Выдача с телефона с этапом попадает в нормативы ----
select pg_temp.login(pg_temp.id('wh'));
select public.save_receipt_row(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'), private.today(),
  pg_temp.id('cement'), null, pg_temp.id('kg'), 100, null);
insert into ids values ('mi', gen_random_uuid());
select public.save_material_issue_draft(pg_temp.id('mi'), pg_temp.id('p1'), pg_temp.id('block'), pg_temp.id('floor'),
  pg_temp.id('crew'), '', '', jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 15)),
  pg_temp.stage('Кладка'));
select public.post_material_issue(pg_temp.id('mi'), gen_random_uuid());
select is((select stage_id from public.material_issues where id = pg_temp.id('mi')), pg_temp.stage('Кладка'),
  'выдача с телефона хранит этап');
select results_eq($$ select issued from public.norm_usage(pg_temp.id('p1'))
                     where material_id = pg_temp.id('cement') and stage_id = pg_temp.stage('Кладка') $$,
  $$ values (15::numeric) $$, 'выдача с этапом считается в нормативе');
-- Без этапа — как раньше (старые вызовы из 8 параметров работают).
select lives_ok($$ select public.save_material_issue_draft(gen_random_uuid(), pg_temp.id('p1'), pg_temp.id('block'),
  pg_temp.id('floor'), pg_temp.id('crew'), '', '', jsonb_build_array(jsonb_build_object('material_id',
  pg_temp.id('cement'), 'quantity', 1))) $$, 'этап необязателен');
-- Д-102: отчёт «Приход за период» — без поставщика: материал, ед., количество.
select results_eq($$ select material, unit, quantity from public.report_warehouse_incoming(pg_temp.id('p1'),
                       private.today() - 1, private.today()) $$,
  $$ values ('Цемент'::text, 'кг'::text, 100::numeric) $$, 'приход за период — без колонки поставщика');
select pg_temp.logout();

-- ---- 2. Накладная со ссылкой на заявку ----
select throws_ok($$ select pg_temp.invoice(gen_random_uuid(), pg_temp.id('req')) $$, 'P0001', 'BF_INVALID_STATUS',
  'к черновику заявки накладную не привязать');
select pg_temp.login(pg_temp.id('wh'));
select public.issue_purchase_request(pg_temp.id('req'), gen_random_uuid());
select pg_temp.logout();
insert into ids values ('inv', gen_random_uuid());
select pg_temp.invoice(pg_temp.id('inv'), pg_temp.id('req'));
select is((select purchase_request_id from public.supplier_invoices where id = pg_temp.id('inv')), pg_temp.id('req'),
  'накладная ссылается на заявку');
select is((select status::text from public.supplier_invoices where id = pg_temp.id('inv')), 'CONFIRMED',
  'накладная по заявке — подтверждена, долг сразу');
-- Исправление без оплат может убрать ссылку.
select pg_temp.invoice(pg_temp.id('inv'), null);
select is((select purchase_request_id from public.supplier_invoices where id = pg_temp.id('inv')), null,
  'ссылку можно убрать исправлением');
select throws_ok($$ select pg_temp.invoice(gen_random_uuid(), gen_random_uuid()) $$, 'P0002', 'BF_NOT_FOUND',
  'чужая/несуществующая заявка — нельзя');
-- Склад накладные не сохраняет.
select pg_temp.login(pg_temp.id('wh'));
select throws_ok($$ select public.save_supplier_invoice(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'),
  pg_temp.id('s1'), '2026-10-20', null, 'TJS', null, jsonb_build_array(jsonb_build_object('description', 'x',
  'category_id', pg_temp.cat('Конструктив'), 'quantity', 1, 'price', 1)), pg_temp.id('req')) $$,
  '42501', 'BF_FORBIDDEN', 'склад накладную не сохраняет');
select pg_temp.logout();

-- ---- 3. Отчёт долгов: номер и дата «Ввода остатков» ----
select pg_temp.login(pg_temp.id('acc'), 'aal2');
insert into ids values ('ob_pay', gen_random_uuid());
select public.save_opening_balance_draft(pg_temp.id('ob_pay'), pg_temp.id('org'), 'PAYABLES', null, '2026-10-01', null,
  jsonb_build_array(jsonb_build_object('supplier_id', pg_temp.id('s2'), 'project_id', pg_temp.id('p1'),
    'amount', 5000, 'currency', 'TJS', 'basis', 'Акт сверки', 'due_date', null)));
select public.post_opening_balance(pg_temp.id('ob_pay'), gen_random_uuid());
select results_eq($$ select source_number, doc_date from public.report_payables(pg_temp.id('org'))
                     where source_doc_type = 'OPENING_BALANCE' $$,
  $$ select number, doc_date from public.opening_balances where id = pg_temp.id('ob_pay') $$,
  'долг из ввода остатков — с номером и датой документа');
select pg_temp.logout();

select * from finish();
rollback;
