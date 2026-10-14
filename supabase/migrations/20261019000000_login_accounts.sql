-- =====================================================================================
-- 0016 Вход без писем (Д-87…Д-90): логин (телефон или имя латиницей) + временный пароль от
-- администратора, обязательная смена при первом входе и после сброса, сброс пароля
-- администратором с завершением сессий и аудитом. MFA обязательна только org_admin и cashier.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Логины (Д-87): свойство учётной записи, уникален во всём BuildFlow (на входе нет организации).
--    Телефон хранится как 992XXXXXXXXX, имя — в нижнем регистре.
-- -------------------------------------------------------------------------------------
create table private.user_logins (
  login      text primary key check (login ~ '^(992[0-9]{9}|[a-z][a-z0-9._-]{2,31})$'),
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Нормализация: «+992 90 123-45-67» → 992901234567; «Ivanov.A» → ivanov.a. NULL — неверный формат.
create function private.normalize_login(p_login text) returns text
language sql immutable set search_path = '' as $$
  select case
    when trim(coalesce(p_login, '')) ~ '^\+?992[0-9 ()-]{9,16}$'
      then nullif(regexp_replace(p_login, '[^0-9]', '', 'g'), '')
    else lower(trim(coalesce(p_login, '')))
  end
$$;

create function private.valid_login(p_login text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(private.normalize_login(p_login) ~ '^(992[0-9]{9}|[a-z][a-z0-9._-]{2,31})$', false)
$$;

-- Email участника необязателен: сотрудники входят по логину.
alter table public.organization_members alter column email drop not null;

-- -------------------------------------------------------------------------------------
-- 2. Обязательная смена пароля (Д-89): признак в app_metadata JWT (ставит только сервер).
--    С ним member_id() = NULL → нет ни прав, ни данных (RLS, функции), даже в обход UI.
-- -------------------------------------------------------------------------------------
create function private.must_change_password() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'must_change_password')::boolean, false)
$$;

create or replace function private.member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.organization_members m
  where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.is_active
    and private.session_alive()
    and not private.must_change_password()
$$;

create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'aal', coalesce((select auth.jwt()) ->> 'aal', 'aal1'),
    'organizations', coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'member_id', m.id,
      'full_name', m.full_name,
      'all_projects', m.all_projects,
      'requires_mfa', private.requires_mfa(o.id),
      'roles', (select coalesce(jsonb_agg(r.code order by r.code), '[]')
                from public.member_roles mr join public.roles r on r.id = mr.role_id
                where mr.member_id = m.id),
      'permissions', (select coalesce(jsonb_agg(distinct p.code), '[]')
                      from public.member_roles mr join public.permissions p on p.role_id = mr.role_id
                      where mr.member_id = m.id
                        and (private.is_aal2() or not private.requires_mfa(o.id))),
      'project_ids', (select coalesce(jsonb_agg(pm.project_id), '[]')
                      from public.project_members pm where pm.member_id = m.id)
    ) order by o.name), '[]')
  )
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid()) and m.is_active and private.session_alive()
    and not private.must_change_password()
$$;

-- -------------------------------------------------------------------------------------
-- 3. MFA обязательна только org_admin и cashier (Д-90, временно до ТЗ 1.0; меняет Д-29).
-- -------------------------------------------------------------------------------------
create or replace function private.requires_mfa(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    join public.roles r on r.id = mr.role_id
    where mr.member_id = private.member_id(p_org)
      and r.code in ('org_admin', 'cashier')
  )
$$;

create or replace function public.current_user_requires_mfa() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    join public.member_roles mr on mr.member_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.user_id = (select auth.uid()) and m.is_active
      and r.code in ('org_admin', 'cashier')
  )
$$;

-- -------------------------------------------------------------------------------------
-- 4. Создание сотрудника: проверка логина (администратор), регистрация логина (сервер).
-- -------------------------------------------------------------------------------------
create function private.require_admin_aal2(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  -- Учётными записями управляет администратор со вторым фактором — даже если матрицу прав изменят.
  if not private.is_aal2() then
    raise exception using errcode = '42501', message = 'BF_MFA_REQUIRED';
  end if;
  if p_org is null or not private.has_permission(p_org, 'members.manage') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
end $$;

-- Только проверка (без записи): формат и свободность логина. Возвращает нормализованный логин.
create function public.prepare_member_account(p_org uuid, p_login text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_login text := private.normalize_login(p_login);
begin
  perform private.require_admin_aal2(p_org);
  if not private.valid_login(p_login) then
    raise exception using errcode = 'P0001', message = 'BF_LOGIN_INVALID';
  end if;
  if exists (select 1 from private.user_logins where login = v_login) then
    raise exception using errcode = 'P0001', message = 'BF_LOGIN_TAKEN';
  end if;
  return v_login;
end $$;

-- Логин созданного пользователя Auth. Только сервер (после создания учётной записи admin API).
create function public.register_login(p_user_id uuid, p_login text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_login text := private.normalize_login(p_login);
  v_constraint text;
begin
  if not private.valid_login(p_login) then
    raise exception using errcode = 'P0001', message = 'BF_LOGIN_INVALID';
  end if;
  insert into private.user_logins (login, user_id) values (v_login, p_user_id);
  return v_login;
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  raise exception using errcode = 'P0001',
    message = case when v_constraint = 'user_logins_user_id_key' then 'BF_USER_HAS_LOGIN' else 'BF_LOGIN_TAKEN' end;
end $$;

-- Логины участников — для экрана «Участники» (таблица логинов клиенту закрыта).
create function public.member_logins(p_org uuid)
returns table (member_id uuid, login text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission(p_org, 'members.manage') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  return query
    select m.id, l.login from public.organization_members m
    join private.user_logins l on l.user_id = m.user_id
    where m.organization_id = p_org;
end $$;

-- -------------------------------------------------------------------------------------
-- 5. Сброс пароля администратором (Д-88): prepare (только проверки) → сервер ставит временный
--    пароль через admin API → complete (сессии, аудит). Себе — нельзя (только скрипт).
-- -------------------------------------------------------------------------------------
create function public.prepare_password_reset(p_member_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org  uuid;
  v_user uuid;
begin
  select organization_id, user_id into v_org, v_user from public.organization_members where id = p_member_id;
  perform private.require_admin_aal2(v_org);
  if v_user = (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'BF_SELF_PASSWORD_RESET';
  end if;
  return v_user;
end $$;

-- Общая часть: завершить все сессии и записать аудит во все организации пользователя (пароль не пишется).
create function private.after_password_reset(p_user_id uuid, p_reason text, p_actor uuid, p_via text)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_sessions int;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = 'P0001', message = 'BF_REASON_REQUIRED';
  end if;
  delete from auth.sessions where user_id = p_user_id;   -- refresh-токены — каскадом
  get diagnostics v_sessions = row_count;
  insert into public.audit_logs (organization_id, actor_id, table_name, record_id, action, new_data)
  select m.organization_id, p_actor, 'organization_members', m.id, 'PASSWORD_RESET',
         jsonb_build_object('reason', trim(p_reason), 'via', p_via, 'sessions_revoked', v_sessions,
                            'full_name', m.full_name)
  from public.organization_members m where m.user_id = p_user_id;
  return v_sessions;
end $$;

create function public.complete_password_reset(p_member_id uuid, p_reason text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.prepare_password_reset(p_member_id);   -- те же проверки ещё раз
begin
  return private.after_password_reset(v_user, p_reason, (select auth.uid()), 'app');
end $$;

-- Сброс серверным скриптом (себе, потеря доступа). Только service_role. Возвращает user_id.
create function public.reset_user_password_by_service(p_login text, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if position('@' in coalesce(p_login, '')) > 0 then
    select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_login));
  else
    select l.user_id into v_user from private.user_logins l where l.login = private.normalize_login(p_login);
  end if;
  if v_user is null then
    raise exception using errcode = 'P0002', message = 'BF_USER_NOT_FOUND';
  end if;
  perform private.after_password_reset(v_user, p_reason, null, 'script');
  return v_user;
end $$;

-- -------------------------------------------------------------------------------------
-- 6. Гранты (Д-40)
-- -------------------------------------------------------------------------------------
revoke all on table private.user_logins from public, anon, authenticated;
revoke all on function private.normalize_login(text), private.valid_login(text), private.require_admin_aal2(uuid),
  private.after_password_reset(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function private.must_change_password() from public, anon;
grant execute on function private.must_change_password() to authenticated, service_role;   -- нужна RLS-хелперам

revoke all on function public.prepare_member_account(uuid, text), public.register_login(uuid, text),
  public.member_logins(uuid), public.prepare_password_reset(uuid), public.complete_password_reset(uuid, text),
  public.reset_user_password_by_service(text, text) from public, anon, authenticated;
grant execute on function public.prepare_member_account(uuid, text), public.member_logins(uuid),
  public.prepare_password_reset(uuid), public.complete_password_reset(uuid, text) to authenticated;
grant execute on function public.register_login(uuid, text), public.reset_user_password_by_service(text, text)
  to service_role;

-- ROLLBACK:
--   drop function (все функции этого файла); вернуть private.member_id, public.my_access из
--   20261013000000_mfa_reset.sql, private.requires_mfa и public.current_user_requires_mfa из foundation;
--   drop table private.user_logins; organization_members.email — not null (если нет NULL).
