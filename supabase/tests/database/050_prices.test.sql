-- Цены скрыты от склада на уровне данных (§5.4, Д-24, Д-25): ни один путь в БД.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);
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

-- Заявка: цемент 20 кг у S1 по 1.5, песок 10 кг у S2 по 0.8 — выдана в работу.
select pg_temp.login(pg_temp.id('acc'), 'aal2');
insert into ids values ('req', gen_random_uuid());
select public.save_purchase_request_draft(pg_temp.id('req'), pg_temp.id('p1'), null, 'TJS', null,
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 20, 'supplier_id', pg_temp.id('s1'), 'price', 1.5),
    jsonb_build_object('material_id', pg_temp.id('sand'), 'quantity', 10, 'supplier_id', pg_temp.id('s2'), 'price', 0.8)));
insert into ids select 'req_cement', id from public.purchase_request_items where material_id = pg_temp.id('cement');
insert into ids select 'req_sand', id from public.purchase_request_items where material_id = pg_temp.id('sand');
select pg_temp.logout();
-- ---- конец фикстуры ----
-- Данные с ценами: заявка в работе, накладная подтверждена, приёмка проведена, вложения загружены.
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select public.issue_purchase_request(pg_temp.id('req'), gen_random_uuid());
insert into ids values ('inv', gen_random_uuid());
select public.save_supplier_invoice_draft(pg_temp.id('inv'), pg_temp.id('p1'), pg_temp.id('s1'), pg_temp.id('req'),
  'Н-1', '2026-10-10', 'TJS', null, jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'),
  'quantity', 20, 'price', 1.5, 'purchase_request_item_id', pg_temp.id('req_cement'))));
select public.submit_supplier_invoice(pg_temp.id('inv'), gen_random_uuid());
select public.confirm_supplier_invoice(pg_temp.id('inv'), gen_random_uuid());
select pg_temp.logout();

select pg_temp.login(pg_temp.id('wh'));
insert into ids values ('gr', gen_random_uuid());
select public.save_goods_receipt_draft(pg_temp.id('gr'), pg_temp.id('p1'), pg_temp.id('s1'), pg_temp.id('req'), null, null,
  jsonb_build_array(jsonb_build_object('purchase_request_item_id', pg_temp.id('req_cement'), 'received_quantity', 20)));
select public.post_goods_receipt(pg_temp.id('gr'), gen_random_uuid());
select pg_temp.logout();

-- Файлы: скан накладной (с ценами) и фото приёмки (как service_role — минуя политики, как сделал бы Storage).
insert into storage.objects (bucket_id, name) values
  ('documents', pg_temp.id('org') || '/SUPPLIER_INVOICE/' || pg_temp.id('inv') || '/scan.pdf'),
  ('documents', pg_temp.id('org') || '/GOODS_RECEIPT/' || pg_temp.id('gr') || '/photo.jpg');
insert into public.document_attachments (organization_id, project_id, doc_type, doc_id, storage_path, file_name,
  mime_type, size_bytes) values
  (pg_temp.id('org'), pg_temp.id('p1'), 'SUPPLIER_INVOICE', pg_temp.id('inv'),
   pg_temp.id('org') || '/SUPPLIER_INVOICE/' || pg_temp.id('inv') || '/scan.pdf', 'scan.pdf', 'application/pdf', 100),
  (pg_temp.id('org'), pg_temp.id('p1'), 'GOODS_RECEIPT', pg_temp.id('gr'),
   pg_temp.id('org') || '/GOODS_RECEIPT/' || pg_temp.id('gr') || '/photo.jpg', 'photo.jpg', 'image/jpeg', 100);

-- ===== Склад: цен нет ни одним путём =====
select pg_temp.login(pg_temp.id('wh'));
select throws_ok($$ select price from public.purchase_request_items $$, '42501', null, 'цена строки заявки — нет');
select throws_ok($$ select amount from public.purchase_request_items $$, '42501', null, 'сумма строки заявки — нет');
select throws_ok($$ select * from public.purchase_request_items $$, '42501', null, 'select * по строкам заявки — нет');
select throws_ok($$ select total_amount from public.supplier_invoices $$, '42501', null, 'сумма накладной — нет');
select throws_ok($$ select price, amount from public.supplier_invoice_items $$, '42501', null, 'цены строк накладной — нет');
select throws_ok($$ select r.id from public.purchase_requests r join public.purchase_request_items i
                    on i.purchase_request_id = r.id where i.price > 0 $$, '42501', null,
  'цена недоступна и в условиях WHERE (нельзя подобрать перебором)');
select is((select count(*)::int from public.purchase_request_items_priced), 0, 'витрина цен заявок — пусто');
select is((select count(*)::int from public.supplier_invoices_priced), 0, 'витрина сумм накладных — пусто');
select is((select count(*)::int from public.supplier_invoice_items_priced), 0, 'витрина цен накладных — пусто');
select is((select count(*)::int from public.audit_logs), 0, 'журнал аудита (снимки с ценами) — пусто');
select is((select count(*)::int from public.payables), 0, 'обязательства (суммы) — пусто');
select is((select count(*)::int from public.document_attachments where doc_type = 'SUPPLIER_INVOICE'), 0,
  'вложения накладных (сканы с ценами) — не видны');
select is((select count(*)::int from storage.objects where name like '%/SUPPLIER_INVOICE/%'), 0,
  'файлы сканов в хранилище — не видны');
select throws_ok($$ select public.add_document_attachment('SUPPLIER_INVOICE', pg_temp.id('inv'),
    pg_temp.id('org') || '/SUPPLIER_INVOICE/' || pg_temp.id('inv') || '/x.pdf', 'x.pdf', 'application/pdf', 1) $$,
  '42501', 'BF_FORBIDDEN', 'прикрепить скан к накладной — нельзя');
-- Что складу нужно — видно.
select is((select count(*)::int from (select id, quantity from public.purchase_request_items) q), 2,
  'количества строк заявки видны');
select is((select count(*)::int from public.document_attachments where doc_type = 'GOODS_RECEIPT'), 1,
  'фото своей приёмки — видно');
select is((select count(*)::int from storage.objects where name like '%/GOODS_RECEIPT/%'), 1,
  'файл фото приёмки — доступен');
select is((select count(*)::int from (select id, number, status, supplier_doc_number from public.supplier_invoices) q), 1,
  'накладная без суммы — видна (Д-25)');
select pg_temp.logout();

-- ===== Прораб: ни заявок, ни цен =====
select pg_temp.login(pg_temp.id('foreman'));
select is((select count(*)::int from (select id from public.purchase_request_items) q), 0, 'прораб не видит заявки');
select is((select count(*)::int from public.purchase_request_items_priced), 0, 'прораб не видит цены');
select pg_temp.logout();

-- ===== Бухгалтер (prices.view) — видит =====
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select is((select sum(amount) from public.purchase_request_items_priced), 38.00::numeric, 'бухгалтер видит суммы заявки');
select is((select total_amount from public.supplier_invoices_priced), 30.00::numeric, 'бухгалтер видит сумму накладной');
select is((select count(*)::int from public.document_attachments where doc_type = 'SUPPLIER_INVOICE'), 1,
  'бухгалтер видит скан накладной');
select is((select count(*)::int from storage.objects where name like '%/SUPPLIER_INVOICE/%'), 1,
  'бухгалтер скачивает скан накладной');
select ok((select count(*) from public.audit_logs) > 0, 'бухгалтер видит журнал аудита');
select pg_temp.logout();

-- Бухгалтер без второго фактора — цен не видит (Д-29).
select pg_temp.login(pg_temp.id('acc'), 'aal1');
select is((select count(*)::int from public.purchase_request_items_priced), 0, 'бухгалтер без MFA не видит цены');
select pg_temp.logout();

-- ===== Управляющий: цены только по своим объектам =====
select pg_temp.login(pg_temp.id('pm'));
select is((select count(*)::int from public.purchase_request_items_priced), 2, 'управляющий видит цены своего объекта');
select pg_temp.logout();

select * from finish();
rollback;
