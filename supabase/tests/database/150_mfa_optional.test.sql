-- Второй фактор — по настройке организации (Д-91): по умолчанию выключен, включается флагом.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

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

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;

insert into ids values
  ('admin', pg_temp.mk_user('admin@t.local')), ('cashier', pg_temp.mk_user('cashier@t.local'));
insert into ids select 'org', public.create_organization('Стройка', pg_temp.id('admin'), 'Админ', 'admin@t.local');

-- 1. по умолчанию второй фактор выключен
select is((select mfa_enforced from public.organizations where id = pg_temp.id('org')), false,
  'новая организация: mfa_enforced = false');

select pg_temp.login(pg_temp.id('admin'));
select public.add_member(pg_temp.id('org'), pg_temp.id('cashier'), null, 'Кассир', array['cashier'], true, '{}');
insert into ids select 'cashier_member', id from public.organization_members where user_id = pg_temp.id('cashier');

-- ---- Выключено: администратор и кассир работают без aal2 ----
-- 2–3
select ok(not public.current_user_requires_mfa(), 'администратору MFA не требуется');
select ok((public.my_access() -> 'organizations' -> 0 -> 'permissions') ? 'members.manage',
  'администратор без aal2 имеет права');
-- 4–6
select is(public.prepare_member_account(pg_temp.id('org'), 'karimov'), 'karimov',
  'администратор без aal2 заводит сотрудника');
select is(public.prepare_password_reset(pg_temp.id('cashier_member')), pg_temp.id('cashier'),
  'администратор без aal2 сбрасывает пароль');
select lives_ok($$ select public.reset_member_mfa(pg_temp.id('cashier_member'), 'проверка') $$,
  'администратор без aal2 сбрасывает второй фактор');
-- 7. переключить флаг клиент не может
select throws_ok($$ update public.organizations set mfa_enforced = true where id = pg_temp.id('org') $$,
  '42501', null, 'клиент не меняет mfa_enforced');
select pg_temp.logout();

-- 8–9
select pg_temp.login(pg_temp.id('cashier'));
select ok(not public.current_user_requires_mfa(), 'кассиру MFA не требуется');
select ok((public.my_access() -> 'organizations' -> 0 -> 'permissions') ? 'cash.post',
  'кассир без aal2 проводит кассовые операции');
select pg_temp.logout();

-- ---- Включено (оператор): правила Д-90 возвращаются ----
update public.organizations set mfa_enforced = true where id = pg_temp.id('org');

-- 10–12
select pg_temp.login(pg_temp.id('admin'));
select ok(public.current_user_requires_mfa(), 'включено: администратору MFA требуется');
select is((public.my_access() -> 'organizations' -> 0 -> 'permissions'), '[]'::jsonb,
  'включено: без aal2 прав нет');
select throws_ok($$ select public.prepare_member_account(pg_temp.id('org'), 'karimov') $$,
  '42501', 'BF_MFA_REQUIRED', 'включено: без aal2 сотрудника не завести');
select pg_temp.logout();

-- 13–14
select pg_temp.login(pg_temp.id('admin'), 'aal2');
select is(public.prepare_member_account(pg_temp.id('org'), 'karimov'), 'karimov',
  'включено: с aal2 — можно');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('cashier'));
select is((public.my_access() -> 'organizations' -> 0 -> 'permissions'), '[]'::jsonb,
  'включено: кассир без aal2 прав не имеет');
select pg_temp.logout();

select * from finish();
rollback;
