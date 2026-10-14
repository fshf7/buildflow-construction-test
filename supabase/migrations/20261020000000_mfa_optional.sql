-- =====================================================================================
-- 0017 Второй фактор — по настройке организации (Д-91, временно; меняет Д-90).
-- organizations.mfa_enforced = false (по умолчанию): вход по логину и паролю для всех ролей,
-- права администратора и кассира — без aal2. true — правила Д-90 (org_admin и cashier — только aal2).
-- Подключённые факторы не удаляются: при mfa_enforced = false код при входе не спрашивается.
-- Переключение — только сервером/оператором (UPDATE под service_role); клиенту колонка не открыта
-- на запись (грант UPDATE на organizations — по списку колонок, mfa_enforced в него не входит).
-- =====================================================================================

alter table public.organizations
  add column mfa_enforced boolean not null default false;

comment on column public.organizations.mfa_enforced is
  'Д-91: true — второй фактор обязателен org_admin и cashier (Д-90); false — не требуется никому';

-- -------------------------------------------------------------------------------------
-- 1. Требование MFA — роль из Д-90 И включённая настройка организации.
-- -------------------------------------------------------------------------------------
create or replace function private.requires_mfa(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    join public.roles r on r.id = mr.role_id
    join public.organizations o on o.id = r.organization_id
    where mr.member_id = private.member_id(p_org)
      and o.mfa_enforced
      and r.code in ('org_admin', 'cashier')
  )
$$;

create or replace function public.current_user_requires_mfa() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    join public.member_roles mr on mr.member_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.user_id = (select auth.uid()) and m.is_active
      and o.mfa_enforced
      and r.code in ('org_admin', 'cashier')
  )
$$;

-- -------------------------------------------------------------------------------------
-- 2. Управление учётными записями: aal2 — только если организация требует второй фактор.
-- -------------------------------------------------------------------------------------
create or replace function private.require_admin_aal2(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_aal2() and private.requires_mfa(p_org) then
    raise exception using errcode = '42501', message = 'BF_MFA_REQUIRED';
  end if;
  if p_org is null or not private.has_permission(p_org, 'members.manage') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
end $$;

create or replace function public.reset_member_mfa(p_member_id uuid, p_reason text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_org  uuid;
  v_user uuid;
begin
  select organization_id, user_id into v_org, v_user
  from public.organization_members where id = p_member_id;

  perform private.require_admin_aal2(v_org);
  if v_user = (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'BF_SELF_MFA_RESET';
  end if;

  return private.reset_mfa(v_user, p_reason, (select auth.uid()), 'app');
end $$;

-- ROLLBACK:
--   вернуть private.requires_mfa, public.current_user_requires_mfa, private.require_admin_aal2 из
--   20261019000000_login_accounts.sql и public.reset_member_mfa из 20261013000000_mfa_reset.sql;
--   alter table public.organizations drop column mfa_enforced;
--   Включить обратно без отката: update public.organizations set mfa_enforced = true where id = '<org>';
