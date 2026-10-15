-- Задачи (BP-06, §4.8): создаёт управляющий своего объекта; переходы исполнителя и управляющего;
-- причина блокировки; видимость (Д-74); комментарии; вложения.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);
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
insert into ids values ('pm2', pg_temp.mk_user('pm2@t.local'));
select pg_temp.login(pg_temp.id('admin'), 'aal2');
insert into public.projects (organization_id, code, name) values (pg_temp.id('org'), 'P2', 'ЖК Запад');
insert into ids select 'p2', id from public.projects where code = 'P2';
select public.add_member(pg_temp.id('org'), pg_temp.id('pm2'), 'pm2@t.local', 'Управляющий 2', array['project_manager'],
  false, array[pg_temp.id('p2')]);
select pg_temp.logout();
insert into ids select 'm_wh', id from public.organization_members where user_id = pg_temp.id('wh');
insert into ids select 'm_cashier', id from public.organization_members where user_id = pg_temp.id('cashier');
insert into ids select 'm_foreman', id from public.organization_members where user_id = pg_temp.id('foreman');
insert into ids select 'm_acc', id from public.organization_members where user_id = pg_temp.id('acc');

create function pg_temp.task(p_user text, p_project text, p_assignee text, p_due date default '2026-10-20')
returns uuid language plpgsql as $$
declare
  v uuid := gen_random_uuid();
begin
  perform pg_temp.login(pg_temp.id(p_user));
  perform public.save_task(v, pg_temp.id(p_project), 'Задача ' || p_assignee, null, pg_temp.id(p_assignee), p_due,
                           'NORMAL', null, null);
  perform pg_temp.logout();
  return v;
end $$;
create function pg_temp.st(p_user text, p_task uuid, p_status text, p_comment text default null) returns text
language plpgsql as $$
declare
  v text;
begin
  perform pg_temp.login(pg_temp.id(p_user), case when p_user in ('acc', 'cashier') then 'aal2' else 'aal1' end);
  v := public.change_task_status(p_task, gen_random_uuid(), p_status::public.task_status, p_comment) ->> 'status';
  perform pg_temp.logout();
  return v;
end $$;

-- ---- Создание ----
select pg_temp.login(pg_temp.id('foreman'));
select throws_ok(format($$select public.save_task(gen_random_uuid(), %L, 'Проверить', null, %L, null, 'NORMAL', null, null)$$,
                        pg_temp.id('p1'), pg_temp.id('m_wh')), '42501', 'BF_FORBIDDEN', 'прораб задачу не создаёт');
select pg_temp.login(pg_temp.id('pm2'));
select throws_ok(format($$select public.save_task(gen_random_uuid(), %L, 'Проверить', null, %L, null, 'NORMAL', null, null)$$,
                        pg_temp.id('p1'), pg_temp.id('m_wh')), '42501', 'BF_FORBIDDEN', 'управляющий чужого объекта не создаёт');
select pg_temp.login(pg_temp.id('pm'));
select throws_ok(format($$select public.save_task(gen_random_uuid(), %L, 'Проверить', null, %L, null, 'NORMAL', null, null)$$,
                        pg_temp.id('p1'), pg_temp.id('m_acc')), 'P0001', 'BF_INVALID_ASSIGNEE',
                 'бухгалтер не исполнитель (только видит)');
select pg_temp.logout();
insert into ids values ('t_wh', pg_temp.task('pm', 'p1', 'm_wh'));
insert into ids values ('t_cash', pg_temp.task('pm', 'p1', 'm_cashier'));
insert into ids values ('t_fore', pg_temp.task('pm', 'p1', 'm_foreman', '2026-01-01'));
select ok((select number from public.tasks where id = pg_temp.id('t_wh')) ~ '^ЗД-\d{4}-\d{6}$', 'номер ЗД при создании');
select is((select status::text from public.tasks where id = pg_temp.id('t_wh')), 'NEW', 'новая задача');

-- ---- Видимость (Д-74) ----
select pg_temp.login(pg_temp.id('wh'));
select is((select count(*) from public.tasks), 1::bigint, 'склад видит только свою задачу');
select pg_temp.login(pg_temp.id('cashier'), 'aal2');
select is((select count(*) from public.tasks), 1::bigint, 'кассир видит только свою задачу');
select pg_temp.login(pg_temp.id('foreman'));
select is((select count(*) from public.tasks), 1::bigint, 'прораб видит только свою задачу');
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select is((select count(*) from public.tasks), 3::bigint, 'бухгалтер видит все');
select pg_temp.login(pg_temp.id('pm'));
select is((select count(*) from public.tasks), 3::bigint, 'управляющий видит задачи своего объекта');
select pg_temp.login(pg_temp.id('pm2'));
select is((select count(*) from public.tasks), 0::bigint, 'управляющий чужого объекта не видит');
select throws_ok(format($$select public.change_task_status(%L, gen_random_uuid(), 'CANCELLED', 'чужое')$$, pg_temp.id('t_wh')),
          '42501', 'BF_FORBIDDEN', 'и не меняет статус');
select pg_temp.logout();

-- ---- Переходы исполнителя ----
select is(pg_temp.st('wh', pg_temp.id('t_wh'), 'IN_PROGRESS'), 'IN_PROGRESS', 'склад: в работу');
select throws_ok(format($$select pg_temp.st('wh', %L, 'BLOCKED', '')$$, pg_temp.id('t_wh')),
          'P0001', 'BF_REASON_REQUIRED', 'блокировка без причины невозможна');
select is(pg_temp.st('wh', pg_temp.id('t_wh'), 'BLOCKED', 'Нет крана'), 'BLOCKED', 'заблокирована с причиной');
select is((select blocked_reason from public.tasks where id = pg_temp.id('t_wh')), 'Нет крана', 'причина сохранена');
select is((select count(*) from public.task_comments where task_id = pg_temp.id('t_wh')), 1::bigint,
          'причина попала в обсуждение');
select is(pg_temp.st('wh', pg_temp.id('t_wh'), 'IN_PROGRESS'), 'IN_PROGRESS', 'разблокирована');
select is(pg_temp.st('wh', pg_temp.id('t_wh'), 'ON_REVIEW'), 'ON_REVIEW', 'на проверку');
select throws_ok(format($$select pg_temp.st('wh', %L, 'DONE')$$, pg_temp.id('t_wh')),
          '42501', 'BF_FORBIDDEN', 'исполнитель сам не закрывает задачу');
select throws_ok(format($$select pg_temp.st('cashier', %L, 'IN_PROGRESS')$$, pg_temp.id('t_wh')),
          '42501', 'BF_FORBIDDEN', 'чужую задачу не исполнить');

-- ---- Решения управляющего ----
select throws_ok(format($$select pg_temp.st('pm', %L, 'IN_PROGRESS', '')$$, pg_temp.id('t_wh')),
          'P0001', 'BF_REASON_REQUIRED', 'возврат в работу — с комментарием');
select is(pg_temp.st('pm', pg_temp.id('t_wh'), 'IN_PROGRESS', 'Переделать отмостку'), 'IN_PROGRESS', 'возврат в работу');
select is(pg_temp.st('wh', pg_temp.id('t_wh'), 'ON_REVIEW'), 'ON_REVIEW', 'снова на проверку');
select is(pg_temp.st('pm', pg_temp.id('t_wh'), 'DONE'), 'DONE', 'управляющий принял');
select ok((select completed_at is not null from public.tasks where id = pg_temp.id('t_wh')), 'время выполнения');
select throws_ok(format($$select pg_temp.st('pm', %L, 'IN_PROGRESS', 'ещё раз')$$, pg_temp.id('t_wh')),
          'P0001', 'BF_INVALID_TRANSITION', 'выполненная задача закрыта');
select throws_ok(format($$select pg_temp.st('cashier', %L, 'DONE')$$, pg_temp.id('t_cash')),
          'P0001', 'BF_INVALID_TRANSITION', 'из «Новой» сразу в «Выполнена» нельзя');
select is(pg_temp.st('pm', pg_temp.id('t_cash'), 'CANCELLED', 'Не актуально'), 'CANCELLED', 'управляющий отменил');

-- Статус меняется только функцией (флаг проведения транзакции теста сбрасываем).
select set_config('bf.in_posting', 'off', true);
select throws_ok(format($$update public.tasks set status = 'DONE' where id = %L$$, pg_temp.id('t_fore')),
          '42501', 'BF_DIRECT_STATUS_CHANGE', 'прямое изменение статуса запрещено');

-- Комментарий исполнителя; посторонний не комментирует.
select pg_temp.login(pg_temp.id('foreman'));
insert into ids values ('c1', gen_random_uuid());
select public.add_task_comment(pg_temp.id('t_fore'), pg_temp.id('c1'), 'Начну завтра');
select public.add_task_comment(pg_temp.id('t_fore'), pg_temp.id('c1'), 'Начну завтра');
select is((select count(*) from public.task_comments where task_id = pg_temp.id('t_fore')), 1::bigint,
          'повтор комментария не создаёт дубль');
select pg_temp.login(pg_temp.id('wh'));
select throws_ok(format($$select public.add_task_comment(%L, gen_random_uuid(), 'чужая')$$, pg_temp.id('t_fore')),
          '42501', 'BF_FORBIDDEN', 'посторонний не комментирует');
select pg_temp.logout();

select * from finish();
rollback;
