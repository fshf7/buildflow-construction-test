-- Базовые отчёты (П-26, Д-75): итоги сходятся со сверочными функциями; права — склад без цен
-- и финансов, управляющий — только свои объекты, кассир — только утверждённые акты.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);
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
-- ---- Данные: второй объект с управляющим, склад (приёмка 21, выдача 15, возврат 5), долги, касса, акты ----
insert into ids values ('pm2', pg_temp.mk_user('pm2@t.local'));
select pg_temp.login(pg_temp.id('admin'), 'aal2');
insert into public.projects (organization_id, code, name) values (pg_temp.id('org'), 'P2', 'ЖК Запад');
insert into ids select 'p2', id from public.projects where code = 'P2';
select public.add_member(pg_temp.id('org'), pg_temp.id('pm2'), 'pm2@t.local', 'Управляющий 2', array['project_manager'],
  false, array[pg_temp.id('p2')]);
insert into ids select 'm2', id from public.units_of_measure where code = 'м²' and organization_id = pg_temp.id('org');
select pg_temp.logout();

select pg_temp.login(pg_temp.id('acc'), 'aal2');
select public.issue_purchase_request(pg_temp.id('req'), gen_random_uuid());
select pg_temp.login(pg_temp.id('wh'));
insert into ids values ('gr1', gen_random_uuid()), ('mi1', gen_random_uuid()), ('mr1', gen_random_uuid());
select public.save_goods_receipt_draft(pg_temp.id('gr1'), pg_temp.id('p1'), pg_temp.id('s1'), pg_temp.id('req'), null, null,
  jsonb_build_array(jsonb_build_object('purchase_request_item_id', pg_temp.id('req_cement'), 'received_quantity', 21)));
select public.post_goods_receipt(pg_temp.id('gr1'), gen_random_uuid());
select public.save_material_issue_draft(pg_temp.id('mi1'), pg_temp.id('p1'), pg_temp.id('block'), pg_temp.id('floor'),
  pg_temp.id('crew'), 'Каримов', null, jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 15)));
select public.post_material_issue(pg_temp.id('mi1'), gen_random_uuid());
select public.save_material_return_draft(pg_temp.id('mr1'), pg_temp.id('mi1'), null,
  jsonb_build_array(jsonb_build_object('material_issue_item_id',
    (select id from public.material_issue_items where material_issue_id = pg_temp.id('mi1')), 'quantity', 5)));
select public.post_material_return(pg_temp.id('mr1'), gen_random_uuid());
select pg_temp.logout();

insert into ids values ('pay_s1', pg_temp.payable('s1', 20, 1.5, 'НК-1'));

select pg_temp.login(pg_temp.id('pm'));
select public.save_work_rate(gen_random_uuid(), pg_temp.id('crew'), pg_temp.id('p1'), 'Фасад', pg_temp.id('m2'),
  30, 'TJS', '2026-01-01', null);
select pg_temp.login(pg_temp.id('foreman'));
insert into ids values ('a1', gen_random_uuid()), ('a2', gen_random_uuid());
select public.save_work_act_draft(pg_temp.id('a1'), pg_temp.id('p1'), pg_temp.id('crew'), '2026-10-10', null, null, null,
  '[{"work_type":"Фасад","quantity":5000}]');
select public.submit_work_act(pg_temp.id('a1'), gen_random_uuid());
select public.save_work_act_draft(pg_temp.id('a2'), pg_temp.id('p1'), pg_temp.id('crew'), '2026-10-11', null, null, null,
  '[{"work_type":"Фасад","quantity":10}]');
select public.submit_work_act(pg_temp.id('a2'), gen_random_uuid());
select pg_temp.login(pg_temp.id('pm'));
select public.approve_work_act(pg_temp.id('a1'), gen_random_uuid());
select public.reject_work_act(pg_temp.id('a2'), gen_random_uuid(), 'Ошибка объёма');
select pg_temp.logout();
insert into ids select 'pay_crew', id from public.payables where source_doc_id = pg_temp.id('a1');

insert into ids values ('acc1', pg_temp.account('Касса отчётов'));
select pg_temp.cash(pg_temp.id('acc1'), 'IN', 'OWNER_FUNDS', 200000);
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
insert into ids values ('tx', gen_random_uuid());
select public.save_cash_transaction_draft(pg_temp.id('tx'), pg_temp.id('org'), pg_temp.id('acc1'), 'OUT', 'CREW_ACT',
  60000, pg_temp.id('p1'), null, pg_temp.id('crew'), null, 'Акт', null,
  jsonb_build_array(jsonb_build_object('payable_id', pg_temp.id('pay_crew'), 'amount', 60000)));
select public.post_cash_transaction(pg_temp.id('tx'), gen_random_uuid());
select pg_temp.logout();

-- ---- Бухгалтер: итоги = сверка ----
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select is((select quantity from public.report_stock_balances(pg_temp.id('org')) where material_id = pg_temp.id('cement')),
          11.0000::numeric, 'остаток цемента 21 − 15 + 5 = 11');
select is((select sum(quantity) from public.report_stock_balances(pg_temp.id('org'))),
          (select sum(quantity) from public.stock_balances where organization_id = pg_temp.id('org')),
          'итог отчёта остатков = stock_balances');
select is_empty(format($$select * from public.check_stock_consistency(%L)$$, pg_temp.id('org')),
          'сверка склада пуста (stock_balances = Σ движений)');
select results_eq(format($$select block_name, floor_name, crew_name, issued, returned, net
                           from public.report_material_issues(%L)$$, pg_temp.id('org')),
  $$values ('Блок А'::text, '1'::text, 'Бригада Каримова'::text, 15.0000::numeric, 5.0000::numeric, 10.0000::numeric)$$,
  'движение: выдано 15, возвращено 5, расход 10 по блоку, этажу и бригаде');
select is((select sum(remaining) from public.report_payables(pg_temp.id('org'))),
          (select sum(amount - paid_amount) from public.payables where organization_id = pg_temp.id('org')
           and status <> 'CANCELLED'), 'итог долгов = обязательства − оплаты');
select is_empty(format($$select * from public.check_cash_consistency(%L)$$, pg_temp.id('org')),
          'сверка денег пуста (paid_amount = Σ оплат, баланс = Σ операций)');
select results_eq(format($$select amount, paid, remaining from public.report_payables(%L, 'CREW')$$, pg_temp.id('org')),
  $$values (150000.00::numeric, 60000.00::numeric, 90000.00::numeric)$$, 'долг бригаде 150 000 − 60 000 = 90 000');
select results_eq(format($$select source_number, remaining from public.report_payables(%L, 'SUPPLIER')$$, pg_temp.id('org')),
  format($$values ((select number from public.supplier_invoices where id = %L), 30.00::numeric)$$, pg_temp.id('inv:НК-1')),
  'долг поставщику по накладной');
select is((select last_payment_date from public.report_payables(pg_temp.id('org'), 'CREW')), private.today(),
          'дата последней оплаты');
select results_eq(format($$select opening, income, expense, closing from public.report_cash(%L, null, null, %L)$$,
                         pg_temp.id('org'), pg_temp.id('acc1')),
  $$values (0::numeric, 200000.00::numeric, 60000.00::numeric, 140000.00::numeric)$$, 'касса: +200 000 −60 000 = 140 000');
select is((select closing from public.report_cash(pg_temp.id('org'), null, null, pg_temp.id('acc1'))),
          (select balance from public.cash_accounts where id = pg_temp.id('acc1')), 'конечный баланс = баланс кассы');
select results_eq(format($$select opening, income, expense, closing from public.report_cash(%L, private.today() + 1, null, %L)$$,
                         pg_temp.id('org'), pg_temp.id('acc1')),
  $$values (140000.00::numeric, 0::numeric, 0::numeric, 140000.00::numeric)$$, 'период после операций: начальный = конечный');
select results_eq(format($$select number is not null, status::text, total, paid, remaining from public.report_work_acts(%L)
                           order by status$$, pg_temp.id('org')),
  $$values (true, 'APPROVED', 150000.00::numeric, 60000.00::numeric, 90000.00::numeric),
           (true, 'REJECTED', 300.00::numeric, null::numeric, null::numeric)$$,
  'акты: утверждённый с оплатой, отклонённый без обязательства');
select pg_temp.logout();

-- ---- Кассир: только утверждённые акты ----
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select is((select count(*) from public.report_work_acts(pg_temp.id('org'))), 1::bigint, 'кассир в отчёте видит только утверждённый акт');
select pg_temp.logout();

-- ---- Склад: без цен и финансов ----
select pg_temp.login(pg_temp.id('wh'));
select is((select quantity from public.report_stock_balances(pg_temp.id('org')) where material_id = pg_temp.id('cement')),
          11.0000::numeric, 'склад видит остатки');
select throws_ok(format($$select * from public.report_payables(%L)$$, pg_temp.id('org')), '42501', 'BF_FORBIDDEN',
          'склад не видит долги');
select throws_ok(format($$select * from public.report_cash(%L)$$, pg_temp.id('org')), '42501', 'BF_FORBIDDEN',
          'склад не видит кассы');
select throws_ok(format($$select * from public.report_work_acts(%L)$$, pg_temp.id('org')), '42501', 'BF_FORBIDDEN',
          'склад не видит акты');
select ok(not exists (select 1 from information_schema.routines r
                      join information_schema.parameters p on p.specific_name = r.specific_name
                      where r.routine_name in ('report_stock_balances', 'report_material_issues')
                        and p.parameter_mode = 'OUT' and p.parameter_name ~ '(price|amount|sum|cost)'),
          'в складских отчётах нет колонок с ценами');
select pg_temp.logout();

-- ---- Прораб: движение только своих бригад ----
select pg_temp.login(pg_temp.id('foreman'));
select is((select count(*) from public.report_material_issues(pg_temp.id('org'))), 1::bigint, 'прораб видит выдачи своей бригады');
select pg_temp.logout();

-- ---- Управляющий чужого объекта: пусто ----
select pg_temp.login(pg_temp.id('pm2'));
select is((select count(*) from public.report_stock_balances(pg_temp.id('org'))), 0::bigint, 'управляющий P2: остатки P1 не видны');
select is((select count(*) from public.report_payables(pg_temp.id('org'))), 0::bigint, 'управляющий P2: долги P1 не видны');
select is((select count(*) from public.report_work_acts(pg_temp.id('org'))), 0::bigint, 'управляющий P2: акты P1 не видны');
select pg_temp.logout();

select * from finish();
rollback;
