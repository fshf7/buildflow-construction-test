-- Финансы: оплаты обязательств (US-05, US-06), касса, сторно, счета на оплату, точность (§4.5, §4.7).
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);
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
-- ---- конец финансовой фикстуры ----
insert into ids values ('kassa', pg_temp.account('Касса')), ('bank', pg_temp.account('Банк'));
insert into ids values ('P1', pg_temp.payable('s1', 100000, 1.5, 'Н-150')),   -- 150 000
                       ('P2', pg_temp.payable('s1', 10000, 1, 'Н-10')),       -- 10 000
                       ('P3', pg_temp.payable('s2', 1000, 1, 'Н-S2'));        -- 1 000, другой поставщик

-- Приход: средства владельца.
select is(pg_temp.cash(pg_temp.id('kassa'), 'IN', 'OWNER_FUNDS', 200000) ->> 'status', 'POSTED', 'приход проведён');
select is(pg_temp.balance_of(pg_temp.id('kassa')), 200000.00, 'баланс кассы 200 000');

-- ===== US-05/06: частичная оплата 60 000 из 150 000 =====
insert into ids values ('pay60', gen_random_uuid()), ('k60', gen_random_uuid());
select matches(pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 60000, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P1'), 60000)), pg_temp.id('k60'), pg_temp.id('pay60')) ->> 'number',
  '^РКО-\d{4}-\d{6}$', 'оплата проведена расходным ордером');
select is(pg_temp.remaining(pg_temp.id('P1')), 90000.00, 'US-05: 150 000 − 60 000 = долг 90 000');
select is((select status::text from public.payables where id = pg_temp.id('P1')), 'PARTIALLY_PAID', 'статус — частично оплачено');
select is(pg_temp.balance_of(pg_temp.id('kassa')), 140000.00, 'баланс кассы уменьшился на 60 000');
select is((select sum(amount) from public.payments where payable_id = pg_temp.id('P1')), 60000.00,
  'payments (представление, Д-11) показывает оплату');

-- Повтор с тем же ключом — без двойного списания.
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select is(public.post_cash_transaction(pg_temp.id('pay60'), pg_temp.id('k60')) ->> 'status', 'POSTED',
  'повтор с тем же ключом — сохранённый ответ');
select pg_temp.logout();
select is(pg_temp.balance_of(pg_temp.id('kassa')), 140000.00, 'повтор не списал деньги второй раз');
select is(pg_temp.remaining(pg_temp.id('P1')), 90000.00, 'повтор не уменьшил долг второй раз');

-- Переплата запрещена, ошибка с остатком долга.
select throws_ok($$ select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 90000.01, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P1'), 90000.01))) $$, 'P0001', 'BF_OVERPAYMENT', 'переплата запрещена');
select is(pg_temp.err_detail($$ select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 90000.01, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P1'), 90000.01))) $$) ->> 'remaining', '90000.00',
  'в ошибке — остаток долга 90 000');

-- ===== Одна операция гасит два обязательства =====
insert into ids values ('pay50', gen_random_uuid());
select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 50000, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P1'), 40000), jsonb_build_array(pg_temp.id('P2'), 10000)),
  gen_random_uuid(), pg_temp.id('pay50'));
select results_eq($$ select pg_temp.remaining(pg_temp.id('P1')), pg_temp.remaining(pg_temp.id('P2')) $$,
  $$ values (50000.00::numeric, 0.00::numeric) $$, 'одна операция погасила два обязательства');
select is((select status::text from public.payables where id = pg_temp.id('P2')), 'PAID', 'второе — оплачено полностью');
select throws_ok($$ select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 100, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P3'), 100))) $$, 'P0001', 'BF_ALLOCATION_MISMATCH',
  'обязательство другого поставщика в ту же операцию не включить (Д-63)');
select throws_ok($$ select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 100, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P1'), 60))) $$, 'P0001', 'BF_ALLOCATION_MISMATCH',
  'сумма распределений должна равняться сумме расхода');

-- ===== Минус кассы запрещён (Д-19), ошибка с текущим балансом =====
select is(pg_temp.balance_of(pg_temp.id('kassa')), 90000.00, 'баланс 90 000');
select throws_ok($$ select pg_temp.cash(pg_temp.id('bank'), 'OUT', 'SUPPLIER', 100, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P1'), 100))) $$, 'P0001', 'BF_NEGATIVE_CASH', 'из пустого банка не заплатить');
select is(pg_temp.err_detail($$ select pg_temp.cash(pg_temp.id('bank'), 'OUT', 'SUPPLIER', 100, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P1'), 100))) $$),
  '{"account": "Банк", "balance": 0.00, "required": 100, "currency": "TJS"}'::jsonb, 'в ошибке — текущий баланс');

-- ===== Сторно оплаты восстанавливает долг и баланс; отмена накладной с оплатами =====
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select throws_ok($$ select public.cancel_supplier_invoice(pg_temp.id('inv:Н-150'), gen_random_uuid(), 'Ошибка') $$,
  'P0001', 'BF_HAS_PAYMENTS', 'отмена накладной с оплатами запрещена');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select matches(public.reverse_cash_transaction(pg_temp.id('pay60'), gen_random_uuid(), 'Ошибочная оплата')
  ->> 'reversal_number', '^ПКО-', 'сторно расхода — приходным ордером со своим номером');
select pg_temp.logout();
select is(pg_temp.remaining(pg_temp.id('P1')), 110000.00, 'сторно восстановило долг: 150 000 − 40 000');
select is(pg_temp.balance_of(pg_temp.id('kassa')), 150000.00, 'сторно вернуло деньги в кассу');
select is((select status::text from public.cash_transactions where id = pg_temp.id('pay60')), 'REVERSED',
  'исходная операция — сторнирована, не удалена');
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select public.reverse_cash_transaction(pg_temp.id('pay50'), gen_random_uuid(), 'Ошибочная оплата');
select throws_ok($$ select public.reverse_cash_transaction(pg_temp.id('pay50'), gen_random_uuid(), 'ещё раз') $$,
  'P0001', 'BF_INVALID_STATUS', 'дважды не сторнировать');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select is(public.cancel_supplier_invoice(pg_temp.id('inv:Н-150'), gen_random_uuid(), 'Ошибка ввода') ->> 'status',
  'CANCELLED', 'после сторно оплат накладную можно отменить');
select pg_temp.logout();
select throws_ok($$ select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 10, pg_temp.id('s1'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P1'), 10))) $$, 'P0001', 'BF_ALLOCATION_MISMATCH',
  'отменённое обязательство не оплатить');

-- Сторно прихода, когда деньги уже потрачены, — минус запрещён.
insert into ids values ('k2', pg_temp.account('Касса 2')), ('in100', gen_random_uuid());
select pg_temp.cash(pg_temp.id('k2'), 'IN', 'OTHER_INCOME', 100, null, '[]', gen_random_uuid(), pg_temp.id('in100'));
select pg_temp.cash(pg_temp.id('k2'), 'OUT', 'SUPPLIER', 60, pg_temp.id('s2'), jsonb_build_array(jsonb_build_array(pg_temp.id('P3'), 60)));
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select throws_ok($$ select public.reverse_cash_transaction(pg_temp.id('in100'), gen_random_uuid(), 'Ошибка') $$,
  'P0001', 'BF_NEGATIVE_CASH', 'сторно прихода не уводит кассу в минус');
select pg_temp.logout();

-- ===== Точность NUMERIC =====
insert into ids values ('P4', pg_temp.payable('s1', 1, 100, 'Н-100'));
select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 33.33, pg_temp.id('s1'), jsonb_build_array(jsonb_build_array(pg_temp.id('P4'), 33.33)))
  from generate_series(1, 3);
select is(pg_temp.remaining(pg_temp.id('P4')), 0.01, '100,00 − 3 × 33,33 = долг ровно 0,01');
select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SUPPLIER', 0.01, pg_temp.id('s1'), jsonb_build_array(jsonb_build_array(pg_temp.id('P4'), 0.01)));
select is((select status::text from public.payables where id = pg_temp.id('P4')), 'PAID', 'последняя копейка — оплачено');
insert into ids values ('k3', pg_temp.account('Касса 3'));
select pg_temp.cash(pg_temp.id('k3'), 'IN', 'OTHER_INCOME', 0.10);
select pg_temp.cash(pg_temp.id('k3'), 'IN', 'OTHER_INCOME', 0.20);
select is(pg_temp.balance_of(pg_temp.id('k3')), 0.30, '0,10 + 0,20 = 0,30 ровно (NUMERIC, не float)');

-- ===== Валюта: без конвертации (Д-18) =====
insert into ids values ('usd', pg_temp.account('Касса USD', 'USD'));
select pg_temp.cash(pg_temp.id('usd'), 'IN', 'OWNER_FUNDS', 1000);
select throws_ok($$ select pg_temp.cash(pg_temp.id('usd'), 'OUT', 'SUPPLIER', 10, pg_temp.id('s2'),
  jsonb_build_array(jsonb_build_array(pg_temp.id('P3'), 10))) $$, 'P0001', 'BF_CURRENCY_MISMATCH',
  'TJS-долг из USD-кассы не оплатить');

-- ===== Счёт на оплату: прочие расходы, зарплаты (§4.5, Д-13, Д-14) =====
insert into ids values ('pr', gen_random_uuid()), ('sal', gen_random_uuid()), ('self', gen_random_uuid());
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select public.save_payment_request_draft(pg_temp.id('pr'), pg_temp.id('org'), null, 'OTHER_EXPENSE', null,
  'Электросеть', 500, 'TJS', 'Электроэнергия за октябрь', null);
select matches(public.submit_payment_request(pg_temp.id('pr'), gen_random_uuid()) ->> 'number', '^СЧ-',
  'счёт отправлен на согласование');
select throws_ok($$ select public.approve_payment_request(pg_temp.id('pr'), gen_random_uuid()) $$,
  '42501', 'BF_FORBIDDEN', 'кассир не согласует');
select throws_ok($$ select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'OTHER_EXPENSE', 100, null,
  jsonb_build_array(jsonb_build_array(pg_temp.id('pr'), 100))) $$, 'P0001', 'BF_REQUEST_NOT_APPROVED',
  'без согласования не оплатить');
select public.save_payment_request_draft(pg_temp.id('sal'), pg_temp.id('org'), null, 'SALARY', null,
  'Зарплата ИТР', 3000, 'TJS', 'Октябрь', null);
select public.submit_payment_request(pg_temp.id('sal'), gen_random_uuid());
select pg_temp.logout();

select pg_temp.login(pg_temp.id('acc'), 'aal2');
select is(public.approve_payment_request(pg_temp.id('pr'), gen_random_uuid()) ->> 'status', 'APPROVED',
  'бухгалтер согласовал прочий расход');
select throws_ok($$ select public.approve_payment_request(pg_temp.id('sal'), gen_random_uuid()) $$,
  '42501', 'BF_FORBIDDEN', 'зарплату бухгалтер не согласует (TODO(TZ-open), Д-13)');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('admin'), 'aal2');
select is(public.approve_payment_request(pg_temp.id('sal'), gen_random_uuid()) ->> 'status', 'APPROVED',
  'зарплату согласует org_admin');
select pg_temp.logout();

select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'OTHER_EXPENSE', 300, null, jsonb_build_array(jsonb_build_array(pg_temp.id('pr'), 300)));
select is((select status::text from public.payment_requests where id = pg_temp.id('pr')), 'PARTIALLY_PAID',
  'частичная оплата счёта');
select throws_ok($$ select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'SALARY', 300, null,
  jsonb_build_array(jsonb_build_array(pg_temp.id('pr'), 300))) $$, 'P0001', 'BF_REQUEST_NOT_APPROVED',
  'категория расхода должна совпадать с назначением счёта');
select pg_temp.cash(pg_temp.id('kassa'), 'OUT', 'OTHER_EXPENSE', 200, null, jsonb_build_array(jsonb_build_array(pg_temp.id('pr'), 200)));
select is((select status::text from public.payment_requests where id = pg_temp.id('pr')), 'PAID', 'счёт оплачен');

-- Согласующий ≠ автор (Д-14): совместитель создаёт и пытается согласовать сам.
select pg_temp.login(pg_temp.id('both'), 'aal2');
select public.save_payment_request_draft(pg_temp.id('self'), pg_temp.id('org'), null, 'OTHER_EXPENSE', null,
  'Канцтовары', 50, 'TJS', 'Бумага', null);
select public.submit_payment_request(pg_temp.id('self'), gen_random_uuid());
select throws_ok($$ select public.approve_payment_request(pg_temp.id('self'), gen_random_uuid()) $$,
  'P0001', 'BF_SELF_APPROVAL', 'свой счёт не согласовать');
select pg_temp.logout();

-- ===== Прочие запреты и сверка =====
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select throws_ok($$ select public.save_cash_transaction_draft(gen_random_uuid(), pg_temp.id('org'), pg_temp.id('kassa'),
  'IN', 'OPENING_BALANCE', 1, null, null, null, null, null, null, '[]') $$, '42501', 'BF_FORBIDDEN',
  'начальный остаток — только документом «Ввод остатков»');
select throws_ok($$ update public.cash_accounts set balance = 1000000 $$, '42501', null, 'баланс напрямую не изменить');
select throws_ok($$ insert into public.cash_transactions (organization_id, cash_account_id, direction, category, amount, currency)
  values (pg_temp.id('org'), pg_temp.id('kassa'), 'IN', 'OTHER_INCOME', 1, 'TJS') $$, '42501', null,
  'операции напрямую не пишутся');
select is_empty($$ select * from public.check_cash_consistency(pg_temp.id('org')) $$,
  'сверка: баланс = Σ проведённых операций; оплачено = Σ распределений');
select pg_temp.logout();

select * from finish();
rollback;
