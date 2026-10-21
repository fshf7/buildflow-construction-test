-- Склад таблицами (Д-100): приход/расход строками, исправление в ячейке, нормативы, услуги, отчёт.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);
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
create function pg_temp.issue(p_id uuid, p_material uuid, p_qty numeric, p_block boolean default true)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.login(pg_temp.id('wh'));
  v := public.save_issue_row(p_id, gen_random_uuid(), pg_temp.id('p1'), private.today(), p_material, p_qty,
    case when p_block then pg_temp.id('block') end, case when p_block then pg_temp.id('floor') end,
    pg_temp.stage('Кладка'), pg_temp.id('crew'));
  perform pg_temp.logout();
  return v;
end $$;

-- Справочник этапов: стартовые у новой организации.
select is((select count(*)::int from public.work_stages where organization_id = pg_temp.id('org')), 6,
  'Д-100: шесть стартовых этапов');

-- Приход: новое наименование «Гушт» — материал добавлен сам, поставщик не нужен.
insert into ids values ('r1', gen_random_uuid());
select is(pg_temp.receipt(pg_temp.id('r1'), null, 'Гушт', 3) ->> 'status', 'POSTED', 'строка прихода проведена');
insert into ids select 'gusht', id from public.materials where organization_id = pg_temp.id('org') and name = 'Гушт';
select isnt(pg_temp.id('gusht'), null, 'новый материал «Гушт» добавлен в справочник');
select is((select supplier_id from public.goods_receipts where id = pg_temp.id('r1')), null, 'поставщик необязателен');
select pg_temp.receipt(gen_random_uuid(), null, '  гушт ', 2);
select is((select count(*)::int from public.materials where organization_id = pg_temp.id('org')
           and lower(trim(name)) = 'гушт'), 1, 'то же название другим регистром — без дубля');
select is(pg_temp.balance(pg_temp.id('gusht')), 5.0000, 'остаток гушта 3 + 2 = 5');

-- Исправление прихода в ячейке: 3 → 4 — корректировка, исходная CORRECTED, остаток 6.
select isnt(pg_temp.receipt(pg_temp.id('r1'), pg_temp.id('gusht'), null, 4) ->> 'id', pg_temp.id('r1')::text,
  'исправление — новая строка (корректировка)');
select is((select status::text from public.goods_receipts where id = pg_temp.id('r1')), 'CORRECTED',
  'исходная приёмка — CORRECTED');
select is(pg_temp.balance(pg_temp.id('gusht')), 6.0000, 'остаток пересчитан: 4 + 2');

-- Расход: цемент 100 пришёл, выдано 30 на блок/этаж/кладку бригаде → остаток 70; минус запрещён.
select pg_temp.receipt(gen_random_uuid(), pg_temp.id('cement'), null, 100, pg_temp.id('s1'));
insert into ids values ('i1', gen_random_uuid());
select is(pg_temp.issue(pg_temp.id('i1'), pg_temp.id('cement'), 30) ->> 'status', 'POSTED', 'строка расхода проведена');
select is((select stage_id from public.material_issues where id = pg_temp.id('i1')), pg_temp.stage('Кладка'),
  'этап работ сохранён');
select is(pg_temp.balance(pg_temp.id('cement')), 70.0000, 'остаток цемента 70');
select throws_ok($$ select pg_temp.issue(gen_random_uuid(), pg_temp.id('cement'), 71) $$, 'P0001', 'BF_NEGATIVE_STOCK',
  'в минус не выдать');
select is(pg_temp.issue(gen_random_uuid(), pg_temp.id('cement'), 1, false) ->> 'status', 'POSTED',
  'расход без блока и этажа (хозрасход) — можно');

-- Исправление расхода: 30 → 20 — сторно исходной и новая выдача.
insert into ids select 'i2', (pg_temp.issue(pg_temp.id('i1'), pg_temp.id('cement'), 20) ->> 'id')::uuid;
select is((select status::text from public.material_issues where id = pg_temp.id('i1')), 'REVERSED',
  'исходная выдача сторнирована');
select is((select replaces_issue_id from public.material_issues where id = pg_temp.id('i2')), pg_temp.id('i1'),
  'новая выдача ссылается на исправленную');
select is(pg_temp.balance(pg_temp.id('cement')), 79.0000, 'остаток: 100 − 20 − 1 = 79');

-- Норматив: склад не задаёт, управляющий — да; остаток норматива = 60 − 20.
select pg_temp.login(pg_temp.id('wh'));
select throws_ok($$ select public.save_material_norm(pg_temp.id('p1'), pg_temp.id('cement'), pg_temp.id('block'),
  pg_temp.stage('Кладка'), 60, null) $$, '42501', 'BF_FORBIDDEN', 'склад нормативы не задаёт');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('pm'));
select public.save_material_norm(pg_temp.id('p1'), pg_temp.id('cement'), pg_temp.id('block'), pg_temp.stage('Кладка'), 60, null);
select results_eq($$ select norm, issued from public.norm_usage(pg_temp.id('p1'))
                    where material_id = pg_temp.id('cement') $$,
  $$ values (60.0000::numeric, 20.0000::numeric) $$, 'норматив 60, выдано 20 (сторно учтено)');
select pg_temp.logout();

-- Услуги: новое название — в справочник; прораб строки склада не вносит.
select pg_temp.login(pg_temp.id('wh'));
select public.save_service_row(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'), private.today(), null,
  'Кран мобильный', pg_temp.id('kg'), 6, pg_temp.id('block'), null, pg_temp.stage('Кладка'), null);
select is((select count(*)::int from public.services where organization_id = pg_temp.id('org')), 1,
  'услуга добавлена в справочник');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('foreman'));
select throws_ok($$ select public.save_issue_row(gen_random_uuid(), gen_random_uuid(), pg_temp.id('p1'), private.today(),
  pg_temp.id('cement'), 1, null, null, null, pg_temp.id('crew')) $$, '42501', 'BF_FORBIDDEN', 'прораб расход не вносит');
select pg_temp.logout();

-- Отчёт за период: остаток на конец сходится с движениями.
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select results_eq($$ select incoming, outgoing, balance from public.report_warehouse_balance(pg_temp.id('p1'), private.today())
                    where material_id = pg_temp.id('cement') $$,
  $$ values (100.0000::numeric, 21.0000::numeric, 79.0000::numeric) $$,
  'отчёт: приход 100, расход 30 − 30 + 20 + 1 = 21, остаток 79');
select pg_temp.logout();

select * from finish();
rollback;
