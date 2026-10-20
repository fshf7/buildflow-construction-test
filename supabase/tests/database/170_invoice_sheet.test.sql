-- Накладная из многих строк (Д-99): номер и долг при сохранении, категория у строки, исправление без оплат.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
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
-- ---- Финансовая часть фикстуры (060/070/080) ----
insert into ids values ('cashier', pg_temp.mk_user('cashier@t.local')), ('both', pg_temp.mk_user('both@t.local'));
select pg_temp.login(pg_temp.id('admin'), 'aal2');
select public.add_member(pg_temp.id('org'), pg_temp.id('cashier'), 'cashier@t.local', 'Кассир', array['cashier'], true, '{}');
-- Совмещающий роли кассира и бухгалтера — для проверки «согласующий ≠ автор» (Д-14).
select public.add_member(pg_temp.id('org'), pg_temp.id('both'), 'both@t.local', 'Совместитель',
  array['cashier', 'accountant'], true, '{}');
select pg_temp.logout();

-- Обязательство через подтверждённую накладную (как в жизни): p_amount = qty × price.
create function pg_temp.payable(p_supplier text, p_qty numeric, p_price numeric, p_doc text, p_currency text default 'TJS')
returns uuid language plpgsql as $$
declare
  v_inv uuid := gen_random_uuid();
begin
  perform pg_temp.login(pg_temp.id('acc'), 'aal2');
  perform public.save_supplier_invoice_draft(v_inv, pg_temp.id('p1'), pg_temp.id(p_supplier), null, p_doc,
    '2026-10-01', p_currency, null,
    jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', p_qty, 'price', p_price)));
  perform public.submit_supplier_invoice(v_inv, gen_random_uuid());
  perform public.confirm_supplier_invoice(v_inv, gen_random_uuid());
  perform pg_temp.logout();
  insert into ids values ('inv:' || p_doc, v_inv);
  return (select id from public.payables where source_doc_id = v_inv);
end $$;

-- Касса (как кассир — cash_accounts.manage).
create function pg_temp.account(p_name text, p_currency text default 'TJS') returns uuid language plpgsql as $$
declare
  v uuid := gen_random_uuid();
begin
  perform pg_temp.login(pg_temp.id('cashier'), 'aal2');
  perform public.save_cash_account(v, pg_temp.id('org'), p_name, 'CASH', p_currency, null, null, null, true);
  perform pg_temp.logout();
  return v;
end $$;

-- Операция: черновик + проведение от имени кассира. p_allocs: [[payable_or_request_id, amount], …].
create function pg_temp.cash(
  p_account uuid, p_dir text, p_cat text, p_amount numeric, p_supplier uuid default null,
  p_allocs jsonb default '[]', p_key uuid default gen_random_uuid(), p_id uuid default gen_random_uuid()
) returns jsonb language plpgsql as $$
declare
  v_res jsonb;
begin
  perform pg_temp.login(pg_temp.id('cashier'), 'aal2');
  perform public.save_cash_transaction_draft(p_id, pg_temp.id('org'), p_account, p_dir::public.cash_direction,
    -- Д-95: операция — в области своих долгов/счетов (объект первого распределения).
    p_cat::public.cash_category, p_amount,
    coalesce((select project_id from public.payables where id = (p_allocs -> 0 ->> 0)::uuid),
             (select project_id from public.payment_requests where id = (p_allocs -> 0 ->> 0)::uuid)),
    p_supplier, null, null, 'основание', null,
    coalesce((select jsonb_agg(jsonb_build_object(
      case when exists (select 1 from public.payables where id = (e ->> 0)::uuid) then 'payable_id' else 'payment_request_id' end,
      e ->> 0, 'amount', (e ->> 1)::numeric)) from jsonb_array_elements(p_allocs) e), '[]'));
  v_res := public.post_cash_transaction(p_id, p_key);
  perform pg_temp.logout();
  return v_res;
end $$;

create function pg_temp.remaining(p uuid) returns numeric language sql as $$
  select amount - paid_amount from public.payables where id = p
$$;
create function pg_temp.balance_of(a uuid) returns numeric language sql as $$
  select balance from public.cash_accounts where id = a
$$;
-- Сторно по Д-67: кассир инициирует, бухгалтер согласует (и проводит).
create function pg_temp.reverse(p_tx uuid, p_reason text) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform pg_temp.login(pg_temp.id('cashier'), 'aal2');
  perform public.request_cash_reversal(p_tx, gen_random_uuid(), p_reason);
  perform pg_temp.login(pg_temp.id('acc'), 'aal2');
  v := public.approve_cash_reversal(p_tx, gen_random_uuid(), null);
  perform pg_temp.logout();
  return v;
end $$;
-- ---- конец финансовой фикстуры ----
insert into ids values ('kassa', pg_temp.account('Касса'));
select pg_temp.cash(pg_temp.id('kassa'), 'IN', 'OWNER_FUNDS', 100000);

-- Накладная от имени бухгалтера: p_lines — [[наименование, категория, кол-во, цена], …].
create function pg_temp.cat(p_name text) returns uuid language sql as $$
  select id from public.expense_categories where organization_id = pg_temp.id('org') and name = p_name
$$;
create function pg_temp.invoice(p_id uuid, p_key uuid, p_lines jsonb, p_supplier text default 's1')
returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform pg_temp.login(pg_temp.id('acc'), 'aal2');
  v := public.save_supplier_invoice(p_id, p_key, pg_temp.id('p1'), pg_temp.id(p_supplier), '2026-10-20', 'Н-0001',
    'TJS', null,
    (select jsonb_agg(jsonb_build_object('description', e ->> 0, 'category_id', pg_temp.cat(e ->> 1),
       'unit_id', pg_temp.id('kg'), 'quantity', (e ->> 2)::numeric, 'price', (e ->> 3)::numeric))
     from jsonb_array_elements(p_lines) e));
  perform pg_temp.logout();
  return v;
end $$;
create function pg_temp.payable_of(p_inv uuid) returns public.payables language sql as $$
  select * from public.payables where source_doc_type = 'SUPPLIER_INVOICE' and source_doc_id = p_inv
$$;

-- Накладная из трёх строк двух категорий: 29×30 + 300×0,97 + 1×500 = 870 + 291 + 500 = 1 661.
insert into ids values ('n1', gen_random_uuid()), ('nk1', gen_random_uuid());
select is(pg_temp.invoice(pg_temp.id('n1'), pg_temp.id('nk1'), '[["Гипс штукатурный", "Конструктив", 29, 30],
  ["Кирпич М150", "Конструктив", 300, 0.97], ["Доставка", "Транспортировка", 1, 500]]') ->> 'status', 'CONFIRMED',
  'Д-99: накладная сохранена и сразу подтверждена');
select matches((select number from public.supplier_invoices where id = pg_temp.id('n1')), '^НК-\d{4}-\d{6}$',
  'номер НК присвоен при сохранении');
select is((pg_temp.payable_of(pg_temp.id('n1'))).amount, 1661.00, 'долг поставщику — на всю сумму накладной');
select is((select count(distinct category_id)::int from public.supplier_invoice_items
           where supplier_invoice_id = pg_temp.id('n1')), 2, 'категория — у каждой строки');
select is((select array_agg(line_no order by line_no) from public.supplier_invoice_items
           where supplier_invoice_id = pg_temp.id('n1')), array[1, 2, 3], 'строки по порядку');

-- Повтор с тем же ключом — без второго долга.
select is(pg_temp.invoice(pg_temp.id('n1'), pg_temp.id('nk1'), '[["Гипс", "Конструктив", 1, 1]]') ->> 'number',
  (select number from public.supplier_invoices where id = pg_temp.id('n1')), 'повтор ключа — тот же ответ');
select is((select count(*)::int from public.payables where source_doc_id = pg_temp.id('n1')), 1, 'долг один');

-- Исправление без оплат: две строки — строки заменены, долг пересчитан, номер прежний.
select pg_temp.invoice(pg_temp.id('n1'), gen_random_uuid(), '[["Гипс штукатурный", "Конструктив", 30, 30],
  ["Доставка", "Транспортировка", 1, 400]]');
select is((pg_temp.payable_of(pg_temp.id('n1'))).amount, 1300.00, 'исправление пересчитало долг: 900 + 400');
select is((select count(*)::int from public.supplier_invoice_items where supplier_invoice_id = pg_temp.id('n1')), 2,
  'строки заменены');

-- Пустая накладная и строка без категории — ошибки; склад накладные не сохраняет и цен не видит.
select throws_ok($$ select pg_temp.invoice(gen_random_uuid(), gen_random_uuid(), '[]') $$,
  'P0001', 'BF_NO_LINES', 'без строк — нельзя');
select throws_ok($$ select pg_temp.invoice(gen_random_uuid(), gen_random_uuid(), '[["Гвозди", "Нет такой", 1, 1]]') $$,
  'P0001', 'BF_REQUIRED_FIELDS', 'строка без категории — нельзя');
select pg_temp.login(pg_temp.id('wh'));
select throws_ok($$ select public.save_supplier_invoice(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'),
  pg_temp.id('s1'), '2026-10-20', null, 'TJS', null, '[]') $$, '42501', 'BF_FORBIDDEN', 'склад накладные не вносит');
select throws_ok($$ select price from public.supplier_invoice_items where supplier_invoice_id = pg_temp.id('n1') $$,
  '42501', null, 'склад не читает цену');
select pg_temp.logout();

-- После оплаты исправить нельзя.
select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 100, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array((pg_temp.payable_of(pg_temp.id('n1'))).id, 100)));
select throws_ok($$ select pg_temp.invoice(pg_temp.id('n1'), gen_random_uuid(), '[["Гипс", "Конструктив", 1, 1]]') $$,
  'P0001', 'BF_HAS_PAYMENTS', 'оплаченную накладную не исправить');

select * from finish();
rollback;
