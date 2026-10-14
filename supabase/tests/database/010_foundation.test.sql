-- Foundation: доступ, RLS, MFA, инварианты, аудит, нумерация.
-- Каждый тест — в транзакции, откатывается целиком.
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

-- -------------------------------------------------------------------------------------
-- Хелперы теста: пользователь в auth.users и «вход» под ним (JWT claims + роль authenticated).
-- -------------------------------------------------------------------------------------
create function pg_temp.mk_user(p_email text) returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          p_email, '', now(), '{}', '{}', now(), now())
  returning id
$$;

-- Вход: настоящая сессия в auth.sessions + её id в JWT (права требуют живую сессию, Д-47).
create function pg_temp.login(p_user uuid, p_aal text default 'aal1') returns void language plpgsql as $$
declare
  v_session uuid := gen_random_uuid();
begin
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

-- Исходные данные (как service_role/скрипт): две организации.
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

insert into ids values
  ('admin_a', pg_temp.mk_user('admin-a@test.local')),
  ('admin_b', pg_temp.mk_user('admin-b@test.local')),
  ('foreman', pg_temp.mk_user('foreman@test.local')),
  ('pm',      pg_temp.mk_user('pm@test.local')),
  ('acc',     pg_temp.mk_user('acc@test.local')),
  ('wh',      pg_temp.mk_user('wh@test.local'));

insert into ids select 'org_a', public.create_organization('Стройка А', v, 'Админ А', 'admin-a@test.local')
  from ids where k = 'admin_a';
insert into ids select 'org_b', public.create_organization('Стройка Б', v, 'Админ Б', 'admin-b@test.local')
  from ids where k = 'admin_b';

-- Этот файл проверяет строгий режим: второй фактор включён (Д-91; режим «выключен» — 150_mfa_optional).
update public.organizations set mfa_enforced = true;

-- 1–4. create_organization
select is((select count(*)::int from public.roles where organization_id = (select v from ids where k='org_a')),
  6, 'создано 6 ролей');
select ok((select count(*) from public.permissions where organization_id = (select v from ids where k='org_a')) > 50,
  'матрица прав засеяна');
select is((select count(*)::int from public.units_of_measure where organization_id = (select v from ids where k='org_a')),
  8, 'базовые единицы измерения созданы');
select is(
  (select r.code from public.member_roles mr join public.roles r on r.id = mr.role_id
   join public.organization_members m on m.id = mr.member_id
   where m.user_id = (select v from ids where k='admin_a')),
  'org_admin', 'первый участник — org_admin');

-- Участники организации А (как админ А, со вторым фактором).
select pg_temp.login((select v from ids where k='admin_a'), 'aal2');
select public.add_member((select v from ids where k='org_a'), (select v from ids where k='foreman'),
  'foreman@test.local', 'Прораб', array['foreman'], false, '{}');
select public.add_member((select v from ids where k='org_a'), (select v from ids where k='pm'),
  'pm@test.local', 'Управляющий', array['project_manager'], false, '{}');
select public.add_member((select v from ids where k='org_a'), (select v from ids where k='acc'),
  'acc@test.local', 'Бухгалтер', array['accountant'], true, '{}');
select public.add_member((select v from ids where k='org_a'), (select v from ids where k='wh'),
  'wh@test.local', 'Склад', array['warehouse'], false, '{}');
select pg_temp.logout();

-- 5. create_organization недоступна обычному пользователю
select pg_temp.login((select v from ids where k='admin_a'), 'aal2');
select throws_ok(
  $$ select public.create_organization('X', auth.uid(), 'X', 'x@x') $$,
  '42501', null, 'create_organization: только service_role');
select pg_temp.logout();

-- -------------------------------------------------------------------------------------
-- Объекты: создание управляющим, автоназначение, склад (Д-22, Д-28)
-- -------------------------------------------------------------------------------------
select pg_temp.login((select v from ids where k='pm'));
insert into public.projects (organization_id, code, name)
  values ((select v from ids where k='org_a'), 'P1', 'ЖК Восток');
insert into ids select 'p1', id from public.projects where code = 'P1';

-- 6–8
select is((select count(*)::int from public.projects), 1, 'управляющий видит созданный им объект');
select is((select count(*)::int from public.warehouses where project_id = (select v from ids where k='p1')),
  1, 'у объекта автоматически создан склад');
select is((select count(*)::int from public.project_members
           where project_id = (select v from ids where k='p1')), 1, 'создатель стал участником объекта');

-- 9. created_by нельзя подменить (Д-14)
insert into public.blocks (organization_id, project_id, name, created_by)
  values ((select v from ids where k='org_a'), (select v from ids where k='p1'), 'Блок А',
          (select v from ids where k='admin_a'));
select is((select created_by from public.blocks where name = 'Блок А'), (select v from ids where k='pm'),
  'created_by = текущий пользователь, значение клиента игнорируется');

-- 10. project_id после создания не меняется
select pg_temp.logout();
select pg_temp.login((select v from ids where k='admin_a'), 'aal2');
insert into public.projects (organization_id, code, name) values ((select v from ids where k='org_a'), 'P2', 'ЖК Запад');
insert into ids select 'p2', id from public.projects where code = 'P2';
select throws_ok(
  $$ update public.blocks set project_id = (select v from ids where k='p2') where name = 'Блок А' $$,
  '42501', null, 'project_id блока не меняется после создания (нет гранта на колонку)');
select pg_temp.logout();

-- -------------------------------------------------------------------------------------
-- Видимость объектов (US-09)
-- -------------------------------------------------------------------------------------
-- 11. прораб без назначения не видит объектов
select pg_temp.login((select v from ids where k='foreman'));
select is((select count(*)::int from public.projects), 0, 'прораб без назначения не видит объекты');
select pg_temp.logout();

-- 12. после назначения видит только свой объект
select pg_temp.login((select v from ids where k='admin_a'), 'aal2');
select public.set_member_projects(
  (select id from public.organization_members where user_id = (select v from ids where k='foreman')),
  false, array[(select v from ids where k='p1')]);
select pg_temp.logout();
select pg_temp.login((select v from ids where k='foreman'));
select results_eq($$ select code from public.projects $$, $$ values ('P1') $$,
  'прораб видит только назначенный объект');

-- 13. прораб не может создавать объекты
select throws_ok(
  $$ insert into public.projects (organization_id, code, name)
     values ((select v from ids where k='org_a'), 'P3', 'X') $$,
  '42501', null, 'прораб не создаёт объекты (RLS)');

-- 14. и не может добавлять участников
select throws_ok(
  $$ select public.add_member((select v from ids where k='org_a'), (select v from ids where k='admin_b'),
       'x@x', 'X', array['foreman'], false, '{}') $$,
  '42501', 'BF_FORBIDDEN', 'add_member: только members.manage');
select pg_temp.logout();

-- 15–17. изоляция организаций: админ Б не видит ничего из А
select pg_temp.login((select v from ids where k='admin_b'), 'aal2');
select is((select count(*)::int from public.projects), 0, 'другая организация: объекты не видны');
select is((select count(*)::int from public.organization_members
           where organization_id = (select v from ids where k='org_a')), 0,
  'другая организация: участники не видны');
select is((select count(*)::int from public.materials where organization_id = (select v from ids where k='org_a')), 0,
  'другая организация: справочники не видны');

-- 18. и не может писать в чужую организацию
select throws_ok(
  $$ insert into public.suppliers (organization_id, name) values ((select v from ids where k='org_a'), 'Чужой') $$,
  '42501', null, 'запись в чужую организацию запрещена');
select pg_temp.logout();

-- -------------------------------------------------------------------------------------
-- MFA обязательна для org_admin и cashier (Д-90; было Д-29)
-- -------------------------------------------------------------------------------------
-- 19–20. администратор без второго фактора не имеет прав; бухгалтеру MFA не обязательна (Д-90)
select pg_temp.login((select v from ids where k='admin_a'), 'aal1');
select is((public.my_access() -> 'organizations' -> 0 -> 'permissions'), '[]'::jsonb,
  'администратор без MFA: список прав пуст');
select ok(public.current_user_requires_mfa(), 'current_user_requires_mfa = true для администратора');
select pg_temp.logout();
select pg_temp.login((select v from ids where k='acc'), 'aal1');
select is((select count(*)::int from public.projects), 2, 'бухгалтер без MFA видит все объекты (Д-90)');
-- 22
select ok(not public.current_user_requires_mfa(), 'current_user_requires_mfa = false для бухгалтера (Д-90)');
select pg_temp.logout();

-- 23. прорабу MFA не требуется
select pg_temp.login((select v from ids where k='foreman'), 'aal1');
select ok(not public.current_user_requires_mfa(), 'прорабу MFA не требуется');
-- 24
select ok((public.my_access() -> 'organizations' -> 0 -> 'permissions') ? 'work_acts.create',
  'my_access возвращает права прораба');
select pg_temp.logout();

-- 25. админ без MFA не может управлять участниками
select pg_temp.login((select v from ids where k='admin_a'), 'aal1');
select throws_ok(
  $$ select public.set_member_roles(
       (select id from public.organization_members where user_id = (select v from ids where k='wh')),
       array['warehouse', 'foreman']) $$,
  '42501', 'BF_FORBIDDEN', 'org_admin без MFA не меняет роли');
select pg_temp.logout();

-- -------------------------------------------------------------------------------------
-- Последний администратор
-- -------------------------------------------------------------------------------------
select pg_temp.login((select v from ids where k='admin_a'), 'aal2');
-- 26
select throws_ok(
  $$ select public.set_member_roles(
       (select id from public.organization_members where user_id = (select v from ids where k='admin_a')),
       array['accountant']) $$,
  'P0001', 'BF_LAST_ADMIN', 'нельзя снять роль с последнего администратора');
-- 27
select throws_ok(
  $$ update public.organization_members set is_active = false
     where user_id = (select v from ids where k='admin_a') $$,
  'P0001', 'BF_LAST_ADMIN', 'нельзя деактивировать последнего администратора');
-- 28. со вторым администратором — можно
select public.set_member_roles(
  (select id from public.organization_members where user_id = (select v from ids where k='pm')),
  array['project_manager', 'org_admin']);
select lives_ok(
  $$ select public.set_member_roles(
       (select id from public.organization_members where user_id = (select v from ids where k='admin_a')),
       array['org_admin', 'accountant']) $$,
  'роли меняются, пока администратор не последний');
-- 29. роли и матрицу напрямую не править
select throws_ok(
  $$ insert into public.member_roles (organization_id, member_id, role_id)
     select (select v from ids where k='org_a'), m.id, r.id
     from public.organization_members m, public.roles r
     where m.user_id = (select v from ids where k='wh') and r.code = 'org_admin'
       and r.organization_id = (select v from ids where k='org_a') $$,
  '42501', null, 'member_roles: прямой INSERT запрещён');
select pg_temp.logout();

-- -------------------------------------------------------------------------------------
-- Аудит
-- -------------------------------------------------------------------------------------
-- 30. изменения пишутся в audit_logs
select ok(exists (select 1 from public.audit_logs where table_name = 'projects' and action = 'INSERT'
                  and actor_id = (select v from ids where k='pm')),
  'создание объекта записано в аудит с автором');
-- 31. склад аудит не читает
select pg_temp.login((select v from ids where k='wh'));
select is((select count(*)::int from public.audit_logs), 0, 'склад не видит журнал аудита');
-- 32. и не может в него писать
select throws_ok(
  $$ insert into public.audit_logs (organization_id, table_name, action)
     values ((select v from ids where k='org_a'), 'x', 'x') $$,
  '42501', null, 'audit_logs: прямой INSERT запрещён');
select pg_temp.logout();

-- -------------------------------------------------------------------------------------
-- Нумерация (Д-10)
-- -------------------------------------------------------------------------------------
-- 33–35
select is(private.next_document_number((select v from ids where k='org_a'), 'PURCHASE_REQUEST', '2026-03-01'),
  'ЗК-2026-000001', 'первый номер заявки');
select is(private.next_document_number((select v from ids where k='org_a'), 'PURCHASE_REQUEST', '2026-03-02'),
  'ЗК-2026-000002', 'номера последовательны');
select is(private.next_document_number((select v from ids where k='org_a'), 'PURCHASE_REQUEST', '2027-01-01'),
  'ЗК-2027-000001', 'новый год — новый счётчик');
-- 36. счётчик своей организации
select is(private.next_document_number((select v from ids where k='org_b'), 'PURCHASE_REQUEST', '2026-03-01'),
  'ЗК-2026-000001', 'у другой организации свой счётчик');

select * from finish();
rollback;
