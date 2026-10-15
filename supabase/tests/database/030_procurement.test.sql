-- Закупки: заявки (§4.1) и накладные (§4.2). Д-13, Д-14, Д-58.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);
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
-- ===== Заявка (§4.1): оформляет склад (Д-92) =====
select pg_temp.login(pg_temp.id('wh'));

select is((select count(*)::int from public.purchase_request_items where purchase_request_id = pg_temp.id('req')), 2,
  'US-01: заявка склада сохранена');
select is((select warehouse_id from public.purchase_requests where id = pg_temp.id('req')),
  (select id from public.warehouses where project_id = pg_temp.id('p1')), 'склад заявки = склад объекта');

insert into ids values ('k_issue', gen_random_uuid());
select is(public.issue_purchase_request(pg_temp.id('req'), pg_temp.id('k_issue')) ->> 'status', 'ISSUED',
  'заявка выдана в работу');
select matches((select number from public.purchase_requests where id = pg_temp.id('req')), '^ЗК-\d{4}-000001$',
  'номер ЗК присвоен при выдаче');
select is(public.issue_purchase_request(pg_temp.id('req'), pg_temp.id('k_issue')) ->> 'number',
  (select number from public.purchase_requests where id = pg_temp.id('req')),
  'повтор с тем же ключом — тот же ответ, без ошибки');
select throws_ok($$ select public.issue_purchase_request(pg_temp.id('req'), gen_random_uuid()) $$,
  'P0001', 'BF_INVALID_STATUS', 'повтор с новым ключом — недопустимый статус');
select throws_ok($$ select public.save_purchase_request_draft(pg_temp.id('req'), pg_temp.id('p1'), null, 'TJS', null, '[]') $$,
  'P0001', 'BF_DOCUMENT_LOCKED', 'выданную заявку нельзя редактировать');
select throws_ok($$ update public.purchase_requests set status = 'CLOSED' where id = pg_temp.id('req') $$,
  '42501', null, 'статус напрямую не меняется (нет гранта)');
select throws_ok($$ select public.issue_purchase_request(pg_temp.id('req'), pg_temp.id('k_issue'), 'x') $$,
  '42883', null, 'лишних аргументов нет');

-- Поставщик и цена в заявке не задаются (Д-92): присланные ключи игнорируются, выдача без них.
insert into ids values ('req2', gen_random_uuid());
select public.save_purchase_request_draft(pg_temp.id('req2'), pg_temp.id('p1'), null, 'TJS', null,
  jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 5,
                                       'supplier_id', pg_temp.id('s1'), 'price', 1.5)));
select is(public.issue_purchase_request(pg_temp.id('req2'), gen_random_uuid()) ->> 'status', 'ISSUED',
  'заявка без поставщика и цены выдаётся в работу');
select throws_ok($$ select public.cancel_purchase_request(pg_temp.id('req2'), gen_random_uuid(), '') $$,
  'P0001', 'BF_REASON_REQUIRED', 'отмена без причины невозможна');
select is(public.cancel_purchase_request(pg_temp.id('req2'), gen_random_uuid(), 'Ошибка ввода') ->> 'status',
  'CANCELLED', 'выданная заявка без приёмок отменена с причиной');
select pg_temp.logout();
select is((select count(*)::int from public.purchase_request_items
           where purchase_request_id = pg_temp.id('req2') and (supplier_id is not null or price is not null)), 0,
  'поставщик и цена из запроса в строку заявки не попали');

-- Бухгалтер заявки не оформляет (Д-92), но видит их строки.
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select throws_ok($$ select public.save_purchase_request_draft(gen_random_uuid(), pg_temp.id('p1'), null, 'TJS', null, '[]') $$,
  '42501', 'BF_FORBIDDEN', 'бухгалтер не создаёт заявки');
select throws_ok($$ select public.cancel_purchase_request(pg_temp.id('req'), gen_random_uuid(), 'Не нужна') $$,
  '42501', 'BF_FORBIDDEN', 'бухгалтер не отменяет заявку склада');
select is((select count(*)::int from public.purchase_request_items where purchase_request_id = pg_temp.id('req')), 2,
  'бухгалтер видит строки заявки');
select pg_temp.logout();

-- ===== Накладная (§4.2, Д-13, Д-14) =====
select pg_temp.login(pg_temp.id('acc'), 'aal2');
insert into ids values ('inv', gen_random_uuid());
select public.save_supplier_invoice_draft(pg_temp.id('inv'), pg_temp.id('p1'), pg_temp.id('s1'), pg_temp.id('req'),
  'Н-77', '2026-10-10', 'TJS', null,
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 21, 'price', 1.5,
                       'purchase_request_item_id', pg_temp.id('req_cement')),
    jsonb_build_object('description', 'Доставка', 'unit_id', (select id from public.units_of_measure
       where code = 'шт' and organization_id = pg_temp.id('org')), 'quantity', 1, 'price', 50)));
select is((select total_amount from public.supplier_invoices_priced where id = pg_temp.id('inv')), 81.50::numeric,
  'сумма накладной = Σ строк (21 × 1,5 + 50)');
select throws_ok($$ select public.confirm_supplier_invoice(pg_temp.id('inv'), gen_random_uuid()) $$,
  'P0001', 'BF_INVALID_STATUS', 'подтвердить можно только после «Проверяется»');
select is(public.submit_supplier_invoice(pg_temp.id('inv'), gen_random_uuid()) ->> 'status', 'UNDER_REVIEW',
  'накладная на проверке');
select matches((select number from public.supplier_invoices where id = pg_temp.id('inv')), '^НК-\d{4}-000001$',
  'номер НК присвоен');
select throws_ok($$ select public.save_supplier_invoice_draft(pg_temp.id('inv'), pg_temp.id('p1'), pg_temp.id('s1'),
    null, 'Н-77', '2026-10-10', 'TJS', null, '[]') $$, 'P0001', 'BF_DOCUMENT_LOCKED',
  'строки проверяемой накладной не правятся');
-- Д-14: автор (этот же бухгалтер) подтверждает сам — это сверка, не согласование.
select is(public.confirm_supplier_invoice(pg_temp.id('inv'), gen_random_uuid()) ->> 'status', 'CONFIRMED',
  'автор подтверждает свою накладную сам (Д-14)');
select is((select created_by = confirmed_by from public.supplier_invoices where id = pg_temp.id('inv')), true,
  'подтвердивший = автор');
select results_eq(
  $$ select counterparty_kind::text, supplier_id, amount, status::text from public.payables
     where source_doc_id = pg_temp.id('inv') $$,
  $$ values ('SUPPLIER', pg_temp.id('s1'), 81.50::numeric(18,2), 'OPEN') $$,
  'подтверждение создало обязательство перед поставщиком (Д-13)');

-- Дубль бумажной накладной.
select throws_ok($$ select public.save_supplier_invoice_draft(gen_random_uuid(), pg_temp.id('p1'), pg_temp.id('s1'),
    null, 'Н-77', '2026-10-10', 'TJS', null, '[]') $$, '23505', null, 'одну накладную поставщика дважды не ввести');

-- Отмена подтверждённой — обязательство отменяется.
select is(public.cancel_supplier_invoice(pg_temp.id('inv'), gen_random_uuid(), 'Неверный поставщик') ->> 'status',
  'CANCELLED', 'подтверждённая накладная отменена');
select is((select status::text from public.payables where source_doc_id = pg_temp.id('inv')), 'CANCELLED',
  'обязательство отменено');
select pg_temp.logout();

-- Склад не подтверждает накладные.
select pg_temp.login(pg_temp.id('wh'));
select throws_ok($$ select public.submit_supplier_invoice(pg_temp.id('inv'), gen_random_uuid()) $$,
  '42501', 'BF_FORBIDDEN', 'склад не работает с накладными');
select pg_temp.logout();

-- ===== Каталог прав (Д-92): заявку оформляет склад, сверяет и закрывает бухгалтер =====
select is(
  (select array_agg(r.code::text order by r.code) from public.permissions p join public.roles r on r.id = p.role_id
   where p.organization_id = pg_temp.id('org') and p.code = 'purchase_requests.manage'),
  array['warehouse'], 'purchase_requests.manage — только у склада');
select is(
  (select array_agg(r.code::text order by r.code) from public.permissions p join public.roles r on r.id = p.role_id
   where p.organization_id = pg_temp.id('org') and p.code = 'purchase_requests.review'),
  array['accountant'], 'purchase_requests.review — только у бухгалтера');

select * from finish();
rollback;
