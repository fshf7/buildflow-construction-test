-- «Ввод остатков» (Д-61): склад, кассы, долги — проведение, идемпотентность, сторно, приватность.
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
    p_cat::public.cash_category, p_amount, null, p_supplier, null, null, 'основание', null,
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
create function pg_temp.stock(p_material text) returns numeric language sql as $$
  select coalesce((select quantity from public.stock_balances where material_id = pg_temp.id(p_material)), 0)
$$;

-- ===== Склад: начальные количества (без цен) =====
select pg_temp.login(pg_temp.id('acc'), 'aal2');
insert into ids values ('ob_stock', gen_random_uuid()), ('k_stock', gen_random_uuid());
select public.save_opening_balance_draft(pg_temp.id('ob_stock'), pg_temp.id('org'), 'STOCK', pg_temp.id('p1'),
  '2026-10-01', null, jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 50)));
select matches(public.post_opening_balance(pg_temp.id('ob_stock'), pg_temp.id('k_stock')) ->> 'number', '^ВО-2026-\d{6}$',
  'ввод остатков склада проведён (ВО)');
select is(pg_temp.stock('cement'), 50::numeric, 'начальный остаток цемента 50');
select is((select movement_type::text from public.stock_movements where source_doc_id = pg_temp.id('ob_stock')), 'OPENING',
  'движение типа «начальный остаток»');
select is(public.post_opening_balance(pg_temp.id('ob_stock'), pg_temp.id('k_stock')) ->> 'status', 'POSTED',
  'повтор с тем же ключом — сохранённый ответ');
select is(pg_temp.stock('cement'), 50::numeric, 'повтор не удвоил остаток');
select is((select doc_date from public.opening_balances where id = pg_temp.id('ob_stock')), '2026-10-01'::date,
  'дата ввода зафиксирована');
select throws_ok($$ select public.save_opening_balance_draft(pg_temp.id('ob_stock'), pg_temp.id('org'), 'STOCK',
  pg_temp.id('p1'), null, null, '[]') $$, 'P0001', 'BF_DOCUMENT_LOCKED', 'после проведения — только сторно');
select pg_temp.logout();

-- Склад видит складской ввод, но не проводит.
select pg_temp.login(pg_temp.id('wh'));
select is((select count(*)::int from public.opening_balances where kind = 'STOCK'), 1, 'склад видит ввод остатков склада');
select throws_ok($$ select public.save_opening_balance_draft(gen_random_uuid(), pg_temp.id('org'), 'STOCK',
  pg_temp.id('p1'), null, null, '[]') $$, '42501', 'BF_FORBIDDEN', 'склад не вводит остатки');
-- Выдача части — потом сторно ввода уйдёт в минус.
insert into ids values ('mi', gen_random_uuid());
select public.save_material_issue_draft(pg_temp.id('mi'), pg_temp.id('p1'), pg_temp.id('block'), pg_temp.id('floor'),
  pg_temp.id('crew'), null, null, jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 20)));
select public.post_material_issue(pg_temp.id('mi'), gen_random_uuid());
select pg_temp.logout();

select pg_temp.login(pg_temp.id('acc'), 'aal2');
select throws_ok($$ select public.reverse_opening_balance(pg_temp.id('ob_stock'), gen_random_uuid(), 'Ошибка ввода') $$,
  'P0001', 'BF_NEGATIVE_STOCK', 'сторно ввода не уводит склад в минус');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('wh'));
select public.reverse_material_issue(pg_temp.id('mi'), gen_random_uuid(), 'Ошибка');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select is(public.reverse_opening_balance(pg_temp.id('ob_stock'), gen_random_uuid(), 'Ошибка ввода') ->> 'status',
  'REVERSED', 'ввод остатков склада сторнирован');
select is(pg_temp.stock('cement'), 0::numeric, 'остаток вернулся к нулю');

-- ===== Кассы: начальный баланс на дату =====
insert into ids values ('ob_cash', gen_random_uuid());
select public.save_opening_balance_draft(pg_temp.id('ob_cash'), pg_temp.id('org'), 'CASH', null, '2026-10-01', null,
  jsonb_build_array(jsonb_build_object('cash_account_id', pg_temp.id('kassa'), 'amount', 1000.50)));
select public.post_opening_balance(pg_temp.id('ob_cash'), gen_random_uuid());
select is(pg_temp.balance_of(pg_temp.id('kassa')), 1000.50, 'начальный баланс кассы 1 000,50');
select results_eq($$ select kind::text, category::text, number from public.cash_transactions
                     where opening_balance_id = pg_temp.id('ob_cash') $$,
  $$ values ('OPENING', 'OPENING_BALANCE', null::text) $$, 'начальный остаток — операция OPENING без кассового номера');
select pg_temp.logout();

-- Кассир не сторнирует начальный остаток операцией — только документом.
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select throws_ok($$ select public.request_cash_reversal(
  (select id from public.cash_transactions where opening_balance_id = pg_temp.id('ob_cash')), gen_random_uuid(), 'x x x') $$,
  'P0001', 'BF_INVALID_STATUS', 'начальный остаток сторнируется только документом ввода');
select pg_temp.logout();

-- ===== Долги поставщикам на дату =====
select pg_temp.login(pg_temp.id('acc'), 'aal2');
insert into ids values ('ob_pay', gen_random_uuid());
select public.save_opening_balance_draft(pg_temp.id('ob_pay'), pg_temp.id('org'), 'PAYABLES', null, '2026-10-01', null,
  jsonb_build_array(jsonb_build_object('supplier_id', pg_temp.id('s1'), 'project_id', pg_temp.id('p1'),
    'amount', 5000, 'currency', 'TJS', 'basis', 'Долг по договору № 5 на 01.10', 'due_date', '2026-11-01')));
select public.post_opening_balance(pg_temp.id('ob_pay'), gen_random_uuid());
insert into ids select 'P_open', id from public.payables where source_doc_type = 'OPENING_BALANCE';
select results_eq($$ select supplier_id, amount, status::text, basis from public.payables where id = pg_temp.id('P_open') $$,
  $$ values (pg_temp.id('s1'), 5000.00::numeric(18,2), 'OPEN', 'Долг по договору № 5 на 01.10') $$,
  'введённый долг — обычное обязательство (общая модель по источнику)');
select pg_temp.logout();

-- Оплачивается как любое обязательство.
select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 1000, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P_open'), 1000)));
select is(pg_temp.remaining(pg_temp.id('P_open')), 4000.00, 'введённый долг частично оплачен: 5 000 − 1 000');

select pg_temp.login(pg_temp.id('acc'), 'aal2');
select throws_ok($$ select public.reverse_opening_balance(pg_temp.id('ob_pay'), gen_random_uuid(), 'Ошибка ввода') $$,
  'P0001', 'BF_HAS_PAYMENTS', 'сторно введённого долга с оплатами запрещено');
-- Кассу с потраченными деньгами сторно ввода в минус не уведёт.
select throws_ok($$ select public.reverse_opening_balance(pg_temp.id('ob_cash'), gen_random_uuid(), 'Ошибка ввода') $$,
  'P0001', 'BF_NEGATIVE_CASH', 'сторно ввода кассы не уводит её в минус');
select pg_temp.logout();

select pg_temp.reverse(
  (select t.id from public.cash_transactions t join public.cash_transaction_allocations a on a.cash_transaction_id = t.id
   where a.payable_id = pg_temp.id('P_open')), 'Ошибочная оплата');
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select is(public.reverse_opening_balance(pg_temp.id('ob_pay'), gen_random_uuid(), 'Ошибка ввода') ->> 'status',
  'REVERSED', 'после сторно оплаты — ввод долга сторнирован');
select is((select status::text from public.payables where id = pg_temp.id('P_open')), 'CANCELLED', 'обязательство отменено');
select is(public.reverse_opening_balance(pg_temp.id('ob_cash'), gen_random_uuid(), 'Ошибка ввода') ->> 'status',
  'REVERSED', 'ввод кассы сторнирован');
select is(pg_temp.balance_of(pg_temp.id('kassa')), 0.00, 'баланс кассы 0');
select is_empty($$ select * from public.check_cash_consistency(pg_temp.id('org')) $$, 'сверка касс и долгов сходится');
select is_empty($$ select * from public.check_stock_consistency(pg_temp.id('org')) $$, 'сверка склада сходится');
select pg_temp.logout();

-- Склад не видит денежный ввод остатков.
select pg_temp.login(pg_temp.id('wh'));
select is((select count(*)::int from public.opening_balances where kind <> 'STOCK'), 0, 'денежный ввод складу не виден');
select is((select count(*)::int from public.opening_cash_items) + (select count(*)::int from public.opening_payable_items), 0,
  'строки денежного ввода складу не видны');
select pg_temp.logout();

select * from finish();
rollback;
