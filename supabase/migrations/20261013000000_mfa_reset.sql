-- =====================================================================================
-- 0003 Сброс второго фактора (фаза 1.5). Решения: Д-45, Д-46 (docs/DECISIONS.md).
--   * org_admin со вторым фактором (aal2) сбрасывает MFA участнику своей организации;
--   * себе — нельзя (только серверный скрипт npm run mfa:reset);
--   * причина обязательна, событие пишется в audit_logs;
--   * все сессии участника завершаются: при следующем входе роль с MFA потребует подключить его заново.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Живая сессия (Д-47). Access-токен (ES256) проверяется без обращения к Auth и живёт до
-- jwt_expiry, даже если сессию завершили (сброс MFA, «выйти везде»). Поэтому права выдаются,
-- только пока сессия из JWT существует в auth.sessions: отзыв доступа к данным — мгновенный.
-- -------------------------------------------------------------------------------------
create function private.session_alive() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
      and s.user_id = (select auth.uid())
  )
$$;

create or replace function private.member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.organization_members m
  where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.is_active
    and private.session_alive()
$$;

-- my_access тоже не показывает организации и права без живой сессии.
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
$$;

revoke all on function private.session_alive() from public, anon;
grant execute on function private.session_alive() to authenticated, service_role;

-- Общая часть: удалить факторы и сессии, записать аудит во все организации пользователя.
-- Фактор — свойство учётной записи, а не членства: сброс затрагивает все организации,
-- поэтому каждая из них видит событие в своём журнале (Д-45).
create function private.reset_mfa(p_user_id uuid, p_reason text, p_actor uuid, p_via text)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_factors int;
  v_sessions int;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = 'P0001', message = 'BF_REASON_REQUIRED';
  end if;

  delete from auth.mfa_factors where user_id = p_user_id;
  get diagnostics v_factors = row_count;

  -- Выход на всех устройствах (refresh-токены удаляются каскадом).
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_sessions = row_count;

  insert into public.audit_logs (organization_id, actor_id, table_name, record_id, action, new_data)
  select m.organization_id, p_actor, 'organization_members', m.id, 'MFA_RESET',
         jsonb_build_object('reason', trim(p_reason), 'via', p_via, 'factors_removed', v_factors,
                            'sessions_revoked', v_sessions, 'full_name', m.full_name, 'email', m.email)
  from public.organization_members m
  where m.user_id = p_user_id;

  return v_factors;
end $$;

-- Сброс администратором из приложения.
create function public.reset_member_mfa(p_member_id uuid, p_reason text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_org  uuid;
  v_user uuid;
begin
  select organization_id, user_id into v_org, v_user
  from public.organization_members where id = p_member_id;

  -- Сам администратор должен войти со вторым фактором — даже если матрицу прав изменят.
  if not private.is_aal2() then
    raise exception using errcode = '42501', message = 'BF_MFA_REQUIRED';
  end if;
  if v_org is null or not private.has_permission(v_org, 'members.manage') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  if v_user = (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'BF_SELF_MFA_RESET';
  end if;

  return private.reset_mfa(v_user, p_reason, (select auth.uid()), 'app');
end $$;

-- Сброс серверным скриптом (свой собственный фактор администратора, потеря доступа). Только service_role.
create function public.reset_user_mfa_by_service(p_email text, p_reason text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select u.id from auth.users u where lower(u.email) = lower(trim(p_email)));
begin
  if v_user is null then
    raise exception using errcode = 'P0002', message = 'BF_USER_NOT_FOUND';
  end if;
  return private.reset_mfa(v_user, p_reason, null, 'script');
end $$;

-- Подключён ли второй фактор у участников — для экрана «Участники». auth.mfa_factors клиенту недоступна.
create function public.member_mfa_status(p_org uuid)
returns table (member_id uuid, has_mfa boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission(p_org, 'members.manage') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  return query
    select m.id, exists (select 1 from auth.mfa_factors f
                         where f.user_id = m.user_id and f.status = 'verified')
    from public.organization_members m
    where m.organization_id = p_org;
end $$;

-- Гранты (Д-40: явные).
revoke all on function private.reset_mfa(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.reset_member_mfa(uuid, text), public.reset_user_mfa_by_service(text, text),
  public.member_mfa_status(uuid) from public, anon, authenticated;

grant execute on function public.reset_member_mfa(uuid, text), public.member_mfa_status(uuid) to authenticated;
grant execute on function public.reset_user_mfa_by_service(text, text) to service_role;

-- ROLLBACK:
--   drop function public.member_mfa_status(uuid);
--   drop function public.reset_user_mfa_by_service(text, text);
--   drop function public.reset_member_mfa(uuid, text);
--   drop function private.reset_mfa(uuid, text, uuid, text);
--   -- private.member_id и public.my_access — вернуть определения из 20261012010000_foundation.sql
--   -- (без проверки private.session_alive()), затем:
--   drop function private.session_alive();
