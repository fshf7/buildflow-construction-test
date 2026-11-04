-- Услуги (Д-109…Д-112): исправление строк бухгалтером, заявки на услуги, сверка с накладными.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);
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
create function pg_temp.stage(p_name text) returns uuid language sql as $$
  select id from public.work_stages where organization_id = pg_temp.id('org') and name = p_name
$$;
create function pg_temp.balance(p_material uuid) returns numeric language sql as $$
  select coalesce(sum(quantity), 0) from public.stock_movements
  where project_id = pg_temp.id('p1') and material_id = p_material
$$;
-- Строка прихода от имени склада: материал по id или новым названием.
create function pg_temp.receipt(p_id uuid, p_material uuid, p_name text, p_qty numeric, p_supplier uuid default null)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.login(pg_temp.id('wh'));
  v := public.save_receipt_row(p_id, gen_random_uuid(), pg_temp.id('p1'), private.today(), p_material, p_name,
    pg_temp.id('kg'), p_qty, p_supplier);
  perform pg_temp.logout();
  return v;
end $$;
create function pg_temp.issue(p_id uuid, p_material uuid, p_qty numeric, p_block boolean default true,
                               p_crew text default 'crew')
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.login(pg_temp.id('wh'));
  v := public.save_issue_row(p_id, gen_random_uuid(), pg_temp.id('p1'), private.today(), p_material, p_qty,
    case when p_block then pg_temp.id('block') end, case when p_block then pg_temp.id('floor') end,
    pg_temp.stage('Кладка'), pg_temp.id(p_crew));
  perform pg_temp.logout();
  return v;
end $$;

-- ---- Д-109: строку старше 7 дней исправляет бухгалтер, склад — нет ----
select pg_temp.receipt(gen_random_uuid(), pg_temp.id('cement'), null, 100);
insert into ids values ('old_r', gen_random_uuid()), ('old_i', gen_random_uuid()), ('old_s', gen_random_uuid());
select pg_temp.login(pg_temp.id('wh'));
select public.save_receipt_row(pg_temp.id('old_r'), gen_random_uuid(), pg_temp.id('p1'), private.today() - 10,
  pg_temp.id('sand'), null, pg_temp.id('kg'), 5, null);
select public.save_issue_row(pg_temp.id('old_i'), gen_random_uuid(), pg_temp.id('p1'), private.today() - 10,
  pg_temp.id('cement'), 10, pg_temp.id('block'), null, pg_temp.stage('Кладка'), pg_temp.id('crew'));
select public.save_service_row(pg_temp.id('old_s'), gen_random_uuid(), pg_temp.id('p1'), private.today() - 10, null,
  'Кран', pg_temp.id('kg'), 6, pg_temp.id('block'), null, pg_temp.stage('Кладка'), pg_temp.id('crew'));
insert into ids select 'crane', id from public.services where organization_id = pg_temp.id('org') and name = 'Кран';
select throws_ok($$ select public.save_issue_row(pg_temp.id('old_i'), gen_random_uuid(), pg_temp.id('p1'),
  private.today() - 10, pg_temp.id('cement'), 8, pg_temp.id('block'), null, pg_temp.stage('Кладка'), pg_temp.id('crew')) $$,
  'P0001', 'BF_ROW_TOO_OLD', 'склад старую строку расхода не исправит');
select pg_temp.logout();

select pg_temp.login(pg_temp.id('acc'), 'aal2');
select isnt((public.save_receipt_row(pg_temp.id('old_r'), gen_random_uuid(), pg_temp.id('p1'), private.today() - 10,
  pg_temp.id('sand'), null, pg_temp.id('kg'), 4, null) ->> 'id')::uuid, pg_temp.id('old_r'),
  'бухгалтер исправил старую строку прихода (корректировка)');
select is(pg_temp.balance(pg_temp.id('sand')), 4.0000, 'остаток песка пересчитан: 4');
select is(public.save_issue_row(pg_temp.id('old_i'), gen_random_uuid(), pg_temp.id('p1'), private.today() - 10,
  pg_temp.id('cement'), 8, pg_temp.id('block'), null, pg_temp.stage('Кладка'), pg_temp.id('crew')) ->> 'status',
  'POSTED', 'бухгалтер исправил старую строку расхода');
select is((select status::text from public.material_issues where id = pg_temp.id('old_i')), 'REVERSED',
  'исходная выдача сторнирована');
select is(pg_temp.balance(pg_temp.id('cement')), 92.0000, 'остаток цемента: 100 − 8');
select public.save_service_row(pg_temp.id('old_s'), gen_random_uuid(), pg_temp.id('p1'), private.today() - 10,
  pg_temp.id('crane'), null, null, 5, pg_temp.id('block'), null, pg_temp.stage('Кладка'), pg_temp.id('crew'));
select is((select quantity from public.service_usages where id = pg_temp.id('old_s')), 5.0000,
  'бухгалтер исправил старую строку услуги');
select throws_ok($$ select public.save_issue_row(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'),
  private.today(), pg_temp.id('cement'), 1, null, null, null, pg_temp.id('crew')) $$,
  '42501', 'BF_FORBIDDEN', 'бухгалтер новую строку расхода не вносит');
select throws_ok($$ select public.post_material_issue(pg_temp.id('old_i'), gen_random_uuid()) $$,
  '42501', 'BF_FORBIDDEN', 'бухгалтер не проводит выдачи напрямую');
select pg_temp.logout();

-- ---- Д-111: заявка на услугу (необязательная) ----
select pg_temp.login(pg_temp.id('foreman2'));
insert into public.crews (organization_id, name, foreman_member_id)
  select pg_temp.id('org'), 'Бригада Саидова', m.id from public.organization_members m
  where m.user_id = pg_temp.id('foreman2');
insert into ids select 'crew2', id from public.crews where name = 'Бригада Саидова';
select pg_temp.logout();
select pg_temp.login(pg_temp.id('acc'), 'aal2');
insert into public.services (organization_id, name, unit_id) values (pg_temp.id('org'), 'Экскаватор', pg_temp.id('kg'));
insert into ids select 'excav', id from public.services where name = 'Экскаватор' and organization_id = pg_temp.id('org');
select pg_temp.logout();

insert into ids values ('sr1', gen_random_uuid());
select pg_temp.login(pg_temp.id('foreman'));
select matches(public.save_service_request(pg_temp.id('sr1'), gen_random_uuid(), pg_temp.id('p1'), pg_temp.id('crane'),
  8, private.today(), pg_temp.id('block'), null, pg_temp.stage('Кладка'), pg_temp.id('crew'), 'кран на кладку') ->> 'number',
  '^ЗУ-\d{4}-\d{6}$', 'прораб создал заявку для своей бригады, номер ЗУ-…');
select throws_ok($$ select public.save_service_request(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'),
  pg_temp.id('crane'), 2, null, null, null, null, pg_temp.id('crew2'), null) $$,
  '42501', 'BF_FORBIDDEN', 'прораб — не для чужой бригады');
select throws_ok($$ select public.save_service_request(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'),
  pg_temp.id('crane'), 2, null, null, null, null, null, null) $$,
  '42501', 'BF_FORBIDDEN', 'прораб — только с бригадой');
select is((select count(*)::int from public.service_requests), 1, 'прораб видит свою заявку');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('foreman2'));
select is((select count(*)::int from public.service_requests), 0, 'другой прораб чужую заявку не видит');
select pg_temp.logout();

select pg_temp.login(pg_temp.id('wh'));
select throws_ok($$ select public.decide_service_request(pg_temp.id('sr1'), gen_random_uuid(), true, null) $$,
  '42501', 'BF_FORBIDDEN', 'склад не согласует');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('pm'));
select throws_ok($$ select public.decide_service_request(pg_temp.id('sr1'), gen_random_uuid(), false, '') $$,
  'P0001', 'BF_REASON_REQUIRED', 'отказ — только с причиной');
select is(public.decide_service_request(pg_temp.id('sr1'), gen_random_uuid(), true, null) ->> 'status', 'APPROVED',
  'управляющий согласовал');
select pg_temp.logout();

select pg_temp.login(pg_temp.id('wh'));
select throws_ok($$ select public.save_service_request(pg_temp.id('sr1'), gen_random_uuid(), pg_temp.id('p1'),
  pg_temp.id('crane'), 10, null, null, null, null, pg_temp.id('crew'), null) $$,
  'P0001', 'BF_INVALID_STATUS', 'согласованную заявку не изменить');
select throws_ok($$ select public.save_service_row(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'),
  private.today(), pg_temp.id('excav'), null, null, 3, null, null, null, pg_temp.id('crew'), pg_temp.id('sr1')) $$,
  'P0001', 'BF_SERVICE_REQUEST_MISMATCH', 'факт другой услуги к заявке не привязать');
insert into ids values ('fact1', gen_random_uuid());
select public.save_service_row(pg_temp.id('fact1'), gen_random_uuid(), pg_temp.id('p1'), private.today(),
  pg_temp.id('crane'), null, null, 6, pg_temp.id('block'), null, pg_temp.stage('Кладка'), pg_temp.id('crew'),
  pg_temp.id('sr1'));
select is((select service_request_id from public.service_usages where id = pg_temp.id('fact1')), pg_temp.id('sr1'),
  'факт по заявке: 6 из 8');
select throws_ok($$ select public.cancel_service_request(pg_temp.id('sr1'), 'не нужна') $$,
  'P0001', 'BF_HAS_USAGES', 'с выполнением — не отменить, только закрыть');
select lives_ok($$ select public.close_service_request(pg_temp.id('sr1')) $$, 'склад закрыл заявку');
select is((select status from public.service_requests where id = pg_temp.id('sr1')), 'DONE', 'заявка выполнена');
select throws_ok($$ select public.save_service_row(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'),
  private.today(), pg_temp.id('crane'), null, null, 1, null, null, null, pg_temp.id('crew'), pg_temp.id('sr1')) $$,
  'P0001', 'BF_SERVICE_REQUEST_MISMATCH', 'к закрытой заявке факт не привязать');
select is(public.save_service_row(pg_temp.id('fact1'), gen_random_uuid(), pg_temp.id('p1'), private.today(),
  pg_temp.id('crane'), null, null, 7, pg_temp.id('block'), null, pg_temp.stage('Кладка'), pg_temp.id('crew'),
  pg_temp.id('sr1')) ->> 'id', pg_temp.id('fact1')::text, 'исправление строки сохраняет закрытую заявку');
select pg_temp.logout();

select * from finish();
rollback;
