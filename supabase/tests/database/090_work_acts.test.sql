-- Акты выполненных работ (BP-05, §4.6): тарифы, утверждение управляющим, обязательство CREW,
-- оплата кассиром, неизменяемость, видимость, отмена, «на основе отклонённого», дубли.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);
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
-- ---- Фикстура актов: второй объект со своим управляющим, тарифы ----
insert into ids values ('pm2', pg_temp.mk_user('pm2@t.local'));
select pg_temp.login(pg_temp.id('admin'), 'aal2');
insert into public.projects (organization_id, code, name) values (pg_temp.id('org'), 'P2', 'ЖК Запад');
insert into ids select 'p2', id from public.projects where code = 'P2';
select public.add_member(pg_temp.id('org'), pg_temp.id('pm2'), 'pm2@t.local', 'Управляющий 2', array['project_manager'],
  false, array[pg_temp.id('p2')]);
insert into ids select 'm2', id from public.units_of_measure where code = 'м²' and organization_id = pg_temp.id('org');
select pg_temp.logout();

-- Д-69: тариф ставит управляющий; прораб — нет.
select pg_temp.login(pg_temp.id('foreman'));
select throws_ok(
  format($$select public.save_work_rate(gen_random_uuid(), %L, %L, 'Фасад', %L, 30, 'TJS', '2026-01-01', null)$$,
         pg_temp.id('crew'), pg_temp.id('p1'), pg_temp.id('m2')),
  '42501', 'BF_FORBIDDEN', 'Д-69: прораб не устанавливает тариф');
select pg_temp.login(pg_temp.id('pm'));
insert into ids values ('rate30', gen_random_uuid());
select public.save_work_rate(pg_temp.id('rate30'), pg_temp.id('crew'), pg_temp.id('p1'), 'Фасад', pg_temp.id('m2'),
  30, 'TJS', '2026-01-01', null);
select public.save_work_rate(gen_random_uuid(), pg_temp.id('crew'), null, 'Штукатурка', pg_temp.id('m2'),
  12.5, 'TJS', '2026-01-01', null);
select throws_ok(
  format($$select public.save_work_rate(gen_random_uuid(), %L, %L, 'Фасад', %L, 31, 'TJS', '2026-01-01', null)$$,
         pg_temp.id('crew'), pg_temp.id('p1'), pg_temp.id('m2')),
  'P0001', 'BF_RATE_EXISTS', 'тариф на ту же дату — исправлением, а не вторым тарифом');
select throws_ok(
  format($$select public.save_work_rate(gen_random_uuid(), %L, %L, 'Фасад', %L, 30, 'TJS', '2026-01-01', null)$$,
         pg_temp.id('crew'), pg_temp.id('p2'), pg_temp.id('m2')),
  '42501', 'BF_FORBIDDEN', 'управляющий не ставит тариф на чужой объект');
select pg_temp.logout();

create function pg_temp.act(p_user text, p_lines jsonb, p_date date default '2026-10-10', p_project text default 'p1')
returns uuid language plpgsql as $$
declare
  v uuid := gen_random_uuid();
begin
  perform pg_temp.login(pg_temp.id(p_user));
  perform public.save_work_act_draft(v, pg_temp.id(p_project), pg_temp.id('crew'), p_date, p_date - 9, p_date, null,
                                     p_lines);
  perform pg_temp.logout();
  return v;
end $$;
create function pg_temp.as_user(p_user text, p_sql text) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform pg_temp.login(pg_temp.id(p_user), case when p_user in ('acc', 'cashier', 'admin') then 'aal2' else 'aal1' end);
  execute p_sql into v;
  perform pg_temp.logout();
  return v;
end $$;

-- ---- 5 000 м² × 30 TJS = 150 000 ----
insert into ids select 'a1', pg_temp.act('foreman', jsonb_build_array(jsonb_build_object(
  'work_type', 'Фасад', 'block_id', pg_temp.id('block'), 'floor_id', pg_temp.id('floor'), 'quantity', 5000)));
select is((select total_amount from public.work_completion_acts where id = pg_temp.id('a1')), 150000.00::numeric,
          'фасад 5000 м² × 30 = 150 000');
select is((select rate from public.work_completion_items where work_completion_act_id = pg_temp.id('a1')), 30.0000::numeric,
          'тариф скопирован в строку');
select throws_ok(
  format($$select pg_temp.act('foreman', '[{"work_type":"Кладка","quantity":1}]')$$),
  'P0001', 'BF_NO_RATE', 'без тарифа строку не добавить');

-- Изменение тарифа не меняет акт (Д-70).
select pg_temp.login(pg_temp.id('pm'));
select public.save_work_rate(gen_random_uuid(), pg_temp.id('crew'), pg_temp.id('p1'), 'Фасад', pg_temp.id('m2'),
  35, 'TJS', '2026-10-01', null);
select pg_temp.logout();
select is((select total_amount from public.work_completion_acts where id = pg_temp.id('a1')), 150000.00::numeric,
          'новый тариф не меняет существующий акт');
select throws_ok(format($$update public.work_rates set rate = 1 where id = %L$$, pg_temp.id('rate30')),
          'P0001', 'BF_RATE_IN_USE', 'тариф из акта не исправить');
-- Новый акт на дату после смены тарифа — уже по 35.
insert into ids select 'a_new', pg_temp.act('foreman', '[{"work_type":"Фасад","quantity":10}]', '2026-10-12');
select is((select total_amount from public.work_completion_acts where id = pg_temp.id('a_new')), 350.00::numeric,
          'тариф берётся на дату акта');

-- ---- Отправка, утверждение ----
select pg_temp.login(pg_temp.id('foreman2'));
select throws_ok(format($$select public.submit_work_act(%L, gen_random_uuid())$$, pg_temp.id('a1')),
          '42501', 'BF_FORBIDDEN', 'чужой черновик не отправить');
select pg_temp.login(pg_temp.id('foreman'));
select is(public.submit_work_act(pg_temp.id('a1'), gen_random_uuid()) ->> 'status', 'REVIEW', 'акт отправлен управляющему');
select ok((select number from public.work_completion_acts where id = pg_temp.id('a1')) ~ '^АКТ-\d{4}-\d{6}$',
          'номер АКТ присвоен при отправке');
select throws_ok(format($$select public.approve_work_act(%L, gen_random_uuid())$$, pg_temp.id('a1')),
          '42501', 'BF_FORBIDDEN', 'прораб не утверждает');
select pg_temp.logout();

-- Автор не утверждает свой акт: совместитель «управляющий + прораб» — BF_SELF_APPROVAL.
insert into ids values ('pmf', pg_temp.mk_user('pmf@t.local'));
select pg_temp.login(pg_temp.id('admin'), 'aal2');
select public.add_member(pg_temp.id('org'), pg_temp.id('pmf'), 'pmf@t.local', 'Совместитель',
  array['project_manager', 'foreman'], false, array[pg_temp.id('p1')]);
select pg_temp.logout();
insert into ids select 'a_self', pg_temp.act('pmf', '[{"work_type":"Фасад","quantity":1}]');
select pg_temp.as_user('pmf', format($$select public.submit_work_act(%L, gen_random_uuid())$$, pg_temp.id('a_self')));
select pg_temp.login(pg_temp.id('pmf'));
select throws_ok(format($$select public.approve_work_act(%L, gen_random_uuid())$$, pg_temp.id('a_self')),
          'P0001', 'BF_SELF_APPROVAL', 'автор не утверждает свой акт');
select pg_temp.logout();

-- Управляющий чужого объекта не видит и не утверждает.
select pg_temp.login(pg_temp.id('pm2'));
select is((select count(*) from public.work_completion_acts where id = pg_temp.id('a1')), 0::bigint,
          'управляющий чужого объекта не видит акт');
select is((select count(*) from public.work_completion_items where work_completion_act_id = pg_temp.id('a1')), 0::bigint,
          '…и его строки');
select throws_ok(format($$select public.approve_work_act(%L, gen_random_uuid())$$, pg_temp.id('a1')),
          '42501', 'BF_FORBIDDEN', 'управляющий чужого объекта не утверждает');
select pg_temp.logout();

-- Бухгалтер не участвует (BP-05).
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select throws_ok(format($$select public.approve_work_act(%L, gen_random_uuid())$$, pg_temp.id('a1')),
          '42501', 'BF_FORBIDDEN', 'бухгалтер не утверждает акт');
select pg_temp.logout();

-- Повтор утверждения с тем же ключом — один payable.
insert into ids values ('k_appr', gen_random_uuid());
select pg_temp.login(pg_temp.id('pm'));
select is(public.approve_work_act(pg_temp.id('a1'), pg_temp.id('k_appr')) ->> 'status', 'APPROVED', 'управляющий утвердил');
select is(public.approve_work_act(pg_temp.id('a1'), pg_temp.id('k_appr')) ->> 'status', 'APPROVED',
          'повтор с тем же ключом — сохранённый ответ');
select throws_ok(format($$select public.approve_work_act(%L, gen_random_uuid())$$, pg_temp.id('a1')),
          'P0001', 'BF_INVALID_STATUS', 'повторное утверждение с новым ключом — без эффекта');
select pg_temp.logout();
select is((select count(*) from public.payables where source_doc_type = 'WORK_ACT' and source_doc_id = pg_temp.id('a1')),
          1::bigint, 'обязательство одно');
insert into ids select 'pay1', id from public.payables where source_doc_id = pg_temp.id('a1');
select results_eq(format($$select counterparty_kind::text, amount, crew_id from public.payables where id = %L$$, pg_temp.id('pay1')),
  format($$values ('CREW', 150000.00::numeric(18,2), %L::uuid)$$, pg_temp.id('crew')),
  'обязательство CREW на 150 000 перед бригадой');

-- Утверждённый акт неизменяем.
select throws_ok(format($$update public.work_completion_items set quantity = 1 where work_completion_act_id = %L$$,
                        pg_temp.id('a1')), 'P0001', 'BF_DOCUMENT_LOCKED', 'строки утверждённого акта не меняются');
select throws_ok(format($$delete from public.work_completion_items where work_completion_act_id = %L$$, pg_temp.id('a1')),
          'P0001', 'BF_DOCUMENT_LOCKED', 'строки утверждённого акта не удаляются');
select throws_ok(format($$update public.work_completion_acts set total_amount = 1, note = 'x' where id = %L$$, pg_temp.id('a1')),
          'P0001', 'BF_DOCUMENT_LOCKED', 'сумма утверждённого акта не меняется (даже в обход функций)');
select throws_ok(format($$delete from public.work_completion_acts where id = %L$$, pg_temp.id('a1')),
          'P0001', 'BF_DOCUMENT_LOCKED', 'утверждённый акт не удаляется');
select pg_temp.login(pg_temp.id('foreman'));
select throws_ok(format($$select public.save_work_act_draft(%L, %L, %L, null, null, null, null, '[]')$$,
                        pg_temp.id('a1'), pg_temp.id('p1'), pg_temp.id('crew')),
          'P0001', 'BF_DOCUMENT_LOCKED', 'утверждённый акт не пересохранить');
select pg_temp.logout();

-- ---- Оплата кассиром 60 000 → долг 90 000 ----
insert into ids values ('acc1', pg_temp.account('Касса актов'));
select pg_temp.cash(pg_temp.id('acc1'), 'IN', 'OWNER_FUNDS', 200000);
insert into ids values ('pay_tx', gen_random_uuid());
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select is((select status::text from public.work_completion_acts where id = pg_temp.id('a1')), 'APPROVED',
          'кассир видит утверждённый акт');
select public.save_cash_transaction_draft(pg_temp.id('pay_tx'), pg_temp.id('org'), pg_temp.id('acc1'), 'OUT', 'CREW_ACT',
  60000, pg_temp.id('p1'), null, pg_temp.id('crew'), null, 'Акт', null,
  jsonb_build_array(jsonb_build_object('payable_id', pg_temp.id('pay1'), 'amount', 60000)));
select public.post_cash_transaction(pg_temp.id('pay_tx'), gen_random_uuid());
select pg_temp.logout();
select is(pg_temp.remaining(pg_temp.id('pay1')), 90000.00::numeric, 'оплачено 60 000 → долг 90 000');
select is((select status::text from public.payables where id = pg_temp.id('pay1')), 'PARTIALLY_PAID', 'частично оплачен');

-- Отмена утверждённого акта с оплатами запрещена.
select pg_temp.login(pg_temp.id('pm'));
select throws_ok(format($$select public.cancel_work_act(%L, gen_random_uuid(), 'ошибка объёма')$$, pg_temp.id('a1')),
          'P0001', 'BF_HAS_PAYMENTS', 'отмена акта с оплатами запрещена');
select pg_temp.logout();

-- После сторно оплаты отмена возможна → обязательство отменено.
select pg_temp.reverse(pg_temp.id('pay_tx'), 'ошибочная оплата');
select pg_temp.login(pg_temp.id('pm'));
select is(public.cancel_work_act(pg_temp.id('a1'), gen_random_uuid(), 'ошибка объёма') ->> 'status', 'CANCELLED',
          'без оплат утверждённый акт отменяется');
select pg_temp.logout();
select is((select status::text from public.payables where id = pg_temp.id('pay1')), 'CANCELLED', 'обязательство отменено');

-- ---- Отклонение: комментарий обязателен, обязательства нет, кассиру не виден ----
insert into ids select 'a2', pg_temp.act('foreman', '[{"work_type":"Штукатурка","quantity":100}]');
select is((select total_amount from public.work_completion_acts where id = pg_temp.id('a2')), 1250.00::numeric,
          'общий тариф бригады (без объекта) применяется');
select pg_temp.as_user('foreman', format($$select public.submit_work_act(%L, gen_random_uuid())$$, pg_temp.id('a2')));
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select is((select count(*) from public.work_completion_acts where id = pg_temp.id('a2')), 0::bigint,
          'акт на проверке кассиру не виден');
select pg_temp.login(pg_temp.id('pm'));
select throws_ok(format($$select public.reject_work_act(%L, gen_random_uuid(), '')$$, pg_temp.id('a2')),
          'P0001', 'BF_REASON_REQUIRED', 'отклонение без комментария невозможно');
select is(public.reject_work_act(pg_temp.id('a2'), gen_random_uuid(), 'Объём завышен') ->> 'status', 'REJECTED',
          'управляющий отклонил');
select pg_temp.logout();
select is((select count(*) from public.payables where source_doc_id = pg_temp.id('a2')), 0::bigint,
          'отклонённый акт не создаёт обязательства');
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select is((select count(*) from public.work_completion_acts where id = pg_temp.id('a2')), 0::bigint,
          'отклонённый акт кассиру не виден');
select is((select count(*) from public.work_completion_items where work_completion_act_id = pg_temp.id('a2')), 0::bigint,
          '…и его строки');
select pg_temp.logout();

-- «Создать на основе отклонённого»: новый черновик со ссылкой и строками; повтор — тот же.
insert into ids values ('a3', gen_random_uuid());
select pg_temp.login(pg_temp.id('foreman'));
select is(public.copy_work_act(pg_temp.id('a2'), pg_temp.id('a3')), pg_temp.id('a3'), 'копия создана');
select is(public.copy_work_act(pg_temp.id('a2'), pg_temp.id('a3')), pg_temp.id('a3'), 'повтор копирования — тот же черновик');
select results_eq(format($$select status::text, replaces_act_id, total_amount from public.work_completion_acts where id = %L$$,
                         pg_temp.id('a3')),
  format($$values ('DRAFT', %L::uuid, 1250.00::numeric(18,2))$$, pg_temp.id('a2')),
  'черновик на основе отклонённого: ссылка и строки');
select throws_ok(format($$select public.copy_work_act(%L, gen_random_uuid())$$, pg_temp.id('a_new')),
          'P0001', 'BF_INVALID_STATUS', 'копировать можно только отклонённый или отменённый');

-- Предупреждение о дубле (не запрет): a3 повторяет a_new? нет — у a_new «Фасад». Создадим явный дубль.
insert into ids select 'a4', pg_temp.act('foreman', '[{"work_type":"Штукатурка","quantity":5}]');
select pg_temp.login(pg_temp.id('foreman'));
select ok(exists (select 1 from public.work_act_duplicates(pg_temp.id('a4')) where act_id = pg_temp.id('a3')),
          'возможный дубль показан');
select ok(not exists (select 1 from public.work_act_duplicates(pg_temp.id('a4')) where act_id = pg_temp.id('a2')),
          'отклонённый акт дублем не считается');
select pg_temp.logout();

select * from finish();
rollback;
