-- Вход без писем (Д-87…Д-90): логины, обязательная смена пароля, сброс пароля администратором.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);
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

-- Этот файл проверяет строгий режим: второй фактор включён (Д-91; режим «выключен» — 150_mfa_optional).
update public.organizations set mfa_enforced = true;

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
-- Вход с флагом обязательной смены пароля в app_metadata JWT (как после создания/сброса).
create function pg_temp.login_mc(p_user uuid, p_must boolean, p_aal text default 'aal1') returns void language plpgsql as $$
declare
  v_session uuid := gen_random_uuid();
begin
  execute 'reset role';
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  values (v_session, p_user, now(), now(), p_aal::auth.aal_level);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal,
    'session_id', v_session, 'app_metadata', json_build_object('must_change_password', p_must))::text, true);
  execute 'set local role authenticated';
end $$;

-- ---- Нормализация и формат логина ----
select is(private.normalize_login('+992 90 123-45-67'), '992901234567', 'телефон нормализуется');
select is(private.normalize_login(' Ivanov.A '), 'ivanov.a', 'имя — нижний регистр, без пробелов');
select ok(not private.valid_login('ab'), 'слишком короткое имя — нет');
select ok(not private.valid_login('+99212345'), 'неполный телефон — нет');
select ok(not private.valid_login('1abc'), 'имя с цифры — нет');
select ok(not private.valid_login('иванов'), 'кириллица — нет (только латиница)');

-- ---- Проверка логина администратором ----
select pg_temp.login(pg_temp.id('admin'), 'aal2');
select is(public.prepare_member_account(pg_temp.id('org'), '+992 90 000 11 22'), '992900001122', 'администратор проверяет логин');
select throws_ok($$ select public.prepare_member_account(pg_temp.id('org'), 'иванов') $$, 'P0001', 'BF_LOGIN_INVALID',
  'неверный формат — понятная ошибка');
select pg_temp.login(pg_temp.id('admin'), 'aal1');
select throws_ok($$ select public.prepare_member_account(pg_temp.id('org'), 'karimov') $$, '42501', 'BF_MFA_REQUIRED',
  'без второго фактора администратор учётными записями не управляет');
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select throws_ok($$ select public.prepare_member_account(pg_temp.id('org'), 'karimov') $$, '42501', 'BF_FORBIDDEN',
  'бухгалтер сотрудников не заводит');
select pg_temp.logout();

-- ---- Регистрация логина (сервер) и уникальность во всём BuildFlow ----
select is(public.register_login(pg_temp.id('wh'), 'Sklad.Vostok'), 'sklad.vostok', 'логин зарегистрирован');
select throws_ok($$ select public.register_login(pg_temp.id('foreman'), 'SKLAD.vostok') $$, 'P0001', 'BF_LOGIN_TAKEN',
  'дубль логина (другой регистр) — нельзя');
select throws_ok($$ select public.register_login(pg_temp.id('wh'), 'second.login') $$, 'P0001', 'BF_USER_HAS_LOGIN',
  'у учётной записи один логин');
insert into ids values ('admin_b', pg_temp.mk_user('admin-b@t.local'));
insert into ids select 'org_b', public.create_organization('Другая стройка', pg_temp.id('admin_b'), 'Админ Б', 'admin-b@t.local');
select pg_temp.login(pg_temp.id('admin_b'), 'aal2');
select throws_ok($$ select public.prepare_member_account(pg_temp.id('org_b'), 'sklad.vostok') $$, 'P0001', 'BF_LOGIN_TAKEN',
  'логин занят и для другой организации — на входе организации нет');
select pg_temp.login(pg_temp.id('admin'), 'aal2');
select results_eq($$ select login from public.member_logins(pg_temp.id('org')) $$, $$ values ('sklad.vostok'::text) $$,
  'администратор видит логины участников');
select pg_temp.logout();

-- ---- Обязательная смена пароля: до смены данных нет (Д-89) ----
select pg_temp.login_mc(pg_temp.id('wh'), true);
select is((select count(*)::int from public.projects), 0, 'с флагом смены пароля объекты не видны');
select is(public.my_access() -> 'organizations', '[]'::jsonb, 'с флагом смены пароля прав нет');
select pg_temp.login_mc(pg_temp.id('wh'), false);
select ok((select count(*)::int from public.projects) > 0, 'после смены пароля данные доступны');
select pg_temp.logout();

-- ---- Сброс пароля администратором ----
insert into ids select 'wh_member', id from public.organization_members where user_id = pg_temp.id('wh');
insert into ids select 'admin_member', id from public.organization_members
  where user_id = pg_temp.id('admin') and organization_id = pg_temp.id('org');
select pg_temp.login(pg_temp.id('admin'), 'aal2');
select throws_ok($$ select public.prepare_password_reset(pg_temp.id('admin_member')) $$, 'P0001', 'BF_SELF_PASSWORD_RESET',
  'себе сбросить пароль нельзя (только скрипт)');
select is(public.prepare_password_reset(pg_temp.id('wh_member')), pg_temp.id('wh'), 'проверка перед сбросом');
select pg_temp.login(pg_temp.id('admin_b'), 'aal2');
select throws_ok($$ select public.prepare_password_reset(pg_temp.id('wh_member')) $$, '42501', 'BF_FORBIDDEN',
  'администратор чужой организации не сбрасывает');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('wh'));                                  -- открытая сессия сотрудника
select pg_temp.login(pg_temp.id('admin'), 'aal2');
select throws_ok($$ select public.complete_password_reset(pg_temp.id('wh_member'), '') $$, 'P0001', 'BF_REASON_REQUIRED',
  'причина обязательна');
select ok(public.complete_password_reset(pg_temp.id('wh_member'), 'Забыл пароль') >= 1, 'сессии сотрудника завершены');
select pg_temp.logout();
select results_eq($$ select new_data ->> 'reason', new_data ? 'password', actor_id from public.audit_logs
                     where action = 'PASSWORD_RESET' and record_id = pg_temp.id('wh_member') $$,
  $$ values ('Забыл пароль'::text, false, pg_temp.id('admin')) $$, 'аудит: причина и кто сбросил, пароля нет');

select * from finish();
rollback;
