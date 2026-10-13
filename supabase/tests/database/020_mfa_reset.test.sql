-- Сброс второго фактора (Д-45, Д-46).
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

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

-- Подключённый TOTP и активная сессия пользователя.
create function pg_temp.enroll(p_user uuid) returns void language sql as $$
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  values (gen_random_uuid(), p_user, 'тест ' || gen_random_uuid(), 'totp', 'verified', now(), now(), 'SECRET');
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  values (gen_random_uuid(), p_user, now(), now(), 'aal2');
$$;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

insert into ids values
  ('admin', pg_temp.mk_user('admin@t.local')),
  ('admin2', pg_temp.mk_user('admin2@t.local')),
  ('acc', pg_temp.mk_user('acc@t.local')),
  ('foreman', pg_temp.mk_user('foreman@t.local')),
  ('admin_b', pg_temp.mk_user('admin-b@t.local'));
insert into ids select 'org', public.create_organization('А', v, 'Админ', 'admin@t.local') from ids where k = 'admin';
insert into ids select 'org_b', public.create_organization('Б', v, 'Админ Б', 'admin-b@t.local') from ids where k = 'admin_b';

select pg_temp.login((select v from ids where k = 'admin'), 'aal2');
select public.add_member((select v from ids where k='org'), (select v from ids where k='acc'), 'acc@t.local',
  'Бухгалтер', array['accountant'], true, '{}');
select public.add_member((select v from ids where k='org'), (select v from ids where k='foreman'), 'foreman@t.local',
  'Прораб', array['foreman'], false, '{}');
select public.add_member((select v from ids where k='org'), (select v from ids where k='admin2'), 'admin2@t.local',
  'Админ 2', array['org_admin'], true, '{}');
select pg_temp.logout();

select pg_temp.enroll(v) from ids where k in ('admin', 'acc', 'admin2');
insert into ids select 'acc_member', id from public.organization_members
  where user_id = (select v from ids where k = 'acc');
insert into ids select 'admin_member', id from public.organization_members
  where user_id = (select v from ids where k = 'admin');
insert into ids select 'admin2_member', id from public.organization_members
  where user_id = (select v from ids where k = 'admin2');

-- 1. статус MFA виден администратору
select pg_temp.login((select v from ids where k = 'admin'), 'aal2');
select ok((select has_mfa from public.member_mfa_status((select v from ids where k='org'))
           where member_id = (select v from ids where k='acc_member')), 'админ видит: у бухгалтера MFA подключена');

-- 2. причина обязательна
select throws_ok(
  $$ select public.reset_member_mfa((select v from ids where k='acc_member'), '  ') $$,
  'P0001', 'BF_REASON_REQUIRED', 'без причины сброс невозможен');

-- 3. себе — нельзя
select throws_ok(
  $$ select public.reset_member_mfa((select v from ids where k='admin_member'), 'потерял телефон') $$,
  'P0001', 'BF_SELF_MFA_RESET', 'сбросить себе нельзя (только скриптом)');

-- 4–7. успешный сброс
select is(public.reset_member_mfa((select v from ids where k='acc_member'), 'Потерян телефон'), 1,
  'сброс удаляет подключённый фактор');
select pg_temp.logout();
select is((select count(*)::int from auth.mfa_factors where user_id = (select v from ids where k='acc')), 0,
  'у бухгалтера не осталось факторов');
select is((select count(*)::int from auth.sessions where user_id = (select v from ids where k='acc')), 0,
  'все сессии бухгалтера завершены');
select is((select new_data ->> 'reason' from public.audit_logs
           where action = 'MFA_RESET' and record_id = (select v from ids where k='acc_member')),
  'Потерян телефон', 'сброс записан в аудит с причиной');
-- 8
select is((select actor_id from public.audit_logs
           where action = 'MFA_RESET' and record_id = (select v from ids where k='acc_member')),
  (select v from ids where k='admin'), 'в аудите — кто сбросил');

-- 9. после сброса бухгалтер снова обязан пройти MFA: без aal2 прав нет
select pg_temp.login((select v from ids where k = 'acc'), 'aal1');
select ok(public.current_user_requires_mfa() and
          (public.my_access() -> 'organizations' -> 0 -> 'permissions') = '[]'::jsonb,
  'после сброса роль снова требует MFA, без неё прав нет');
select pg_temp.logout();

-- 10. администратор без второго фактора сбросить не может
select pg_temp.login((select v from ids where k = 'admin'), 'aal1');
select throws_ok(
  $$ select public.reset_member_mfa((select v from ids where k='admin2_member'), 'проверка') $$,
  '42501', 'BF_MFA_REQUIRED', 'админ без aal2 не сбрасывает MFA');
select pg_temp.logout();

-- 11. не администратор — не может
select pg_temp.login((select v from ids where k = 'foreman'), 'aal2');
select throws_ok(
  $$ select public.reset_member_mfa((select v from ids where k='admin2_member'), 'проверка') $$,
  '42501', 'BF_FORBIDDEN', 'прораб не сбрасывает MFA');
-- 12. и не видит статус MFA
select throws_ok(
  $$ select * from public.member_mfa_status((select v from ids where k='org')) $$,
  '42501', 'BF_FORBIDDEN', 'прораб не видит статусы MFA');
select pg_temp.logout();

-- 13. администратор другой организации — не может
select pg_temp.login((select v from ids where k = 'admin_b'), 'aal2');
select throws_ok(
  $$ select public.reset_member_mfa((select v from ids where k='admin2_member'), 'проверка') $$,
  '42501', 'BF_FORBIDDEN', 'админ чужой организации не сбрасывает MFA');
-- 14. серверный сброс пользователю недоступен
select throws_ok(
  $$ select public.reset_user_mfa_by_service('admin@t.local', 'проверка') $$,
  '42501', null, 'reset_user_mfa_by_service — только service_role');
select pg_temp.logout();

-- 15–16. скрипт (service_role) сбрасывает фактор самому администратору
select is(public.reset_user_mfa_by_service('ADMIN@t.local', 'Админ потерял телефон'), 1,
  'npm run mfa:reset сбрасывает фактор администратору');
select is((select new_data ->> 'via' from public.audit_logs
           where action = 'MFA_RESET' and record_id = (select v from ids where k='admin_member')),
  'script', 'аудит отмечает сброс скриптом');
-- 17
select throws_ok(
  $$ select public.reset_user_mfa_by_service('nobody@t.local', 'проверка') $$,
  'P0002', 'BF_USER_NOT_FOUND', 'несуществующий email — понятная ошибка');

-- 18–19. Д-47: завершённая сессия сразу лишает прав, даже с ещё действующим JWT.
select pg_temp.login((select v from ids where k = 'foreman'), 'aal1');
select is(jsonb_array_length(public.my_access() -> 'organizations'), 1, 'с живой сессией прораб в организации');
-- Тот же JWT (claims не меняем), но сессию удалили — как при сбросе MFA или «выйти везде».
reset role;
delete from auth.sessions where user_id = (select v from ids where k = 'foreman');
set local role authenticated;
select is(jsonb_array_length(public.my_access() -> 'organizations'), 0,
  'после удаления сессии тот же JWT не даёт ни организаций, ни прав');
select pg_temp.logout();

select * from finish();
rollback;
