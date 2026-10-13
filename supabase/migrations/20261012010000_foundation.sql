-- =====================================================================================
-- 0002 Foundation: организации и доступ, объекты и склады, справочники, аудит, нумерация.
-- Модель — docs/ARCHITECTURE.md §2.1–2.3, §2.8, §3, §5, §7; решения — docs/DECISIONS.md.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 0. Схема private: хелперы RLS и служебные функции. В PostgREST не выставлена.
-- -------------------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
-- authenticated нужна USAGE: RLS-политики вызывают private.* от имени пользователя.
grant usage on schema private to authenticated, service_role;

-- anon не получает ничего ни сейчас, ни в будущих миграциях.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;
-- Функции по умолчанию не исполняются всеми подряд; права выдаются явно.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- -------------------------------------------------------------------------------------
-- 1. Типы
-- -------------------------------------------------------------------------------------
create type public.project_status as enum ('ACTIVE', 'ARCHIVED');

create type public.document_type as enum (
  'PURCHASE_REQUEST', 'SUPPLIER_INVOICE', 'GOODS_RECEIPT', 'MATERIAL_ISSUE', 'MATERIAL_RETURN',
  'PAYMENT_REQUEST', 'CASH_IN', 'CASH_OUT', 'WORK_ACT', 'TASK'
);

-- -------------------------------------------------------------------------------------
-- 2. Общие триггеры
-- -------------------------------------------------------------------------------------

-- created_by — всегда текущий пользователь (Д-14). Без пользователя (service_role, скрипты)
-- оставляем переданное значение: такие вызовы доверенные.
create function private.set_created_by() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

-- updated_at + неизменяемость id, organization_id, created_*.
create function private.before_update_std() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  if to_jsonb(old) ? 'organization_id' then
    new.organization_id := old.organization_id;
  end if;
  if to_jsonb(old) ? 'project_id' and (to_jsonb(old) ->> 'project_id') is not null then
    -- Объект документа/справочника после создания не меняется (§1.4).
    new.project_id := old.project_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- -------------------------------------------------------------------------------------
-- 3. Доступ: организации, участники, роли, права
-- -------------------------------------------------------------------------------------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  tax_id           text,
  default_currency char(3) not null default 'TJS' check (default_currency ~ '^[A-Z]{3}$'),
  timezone         text not null default 'Asia/Dushanbe',
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now()
);

create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id         uuid not null references auth.users (id),
  full_name       text not null check (length(trim(full_name)) > 0),
  email           text not null,          -- копия для списков: auth.users клиенту недоступна
  phone           text,
  is_active       boolean not null default true,
  all_projects    boolean not null default false,   -- Д-27
  invited_at      timestamptz,
  invited_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)
);
create index on public.organization_members (user_id);

create table public.roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code            text not null check (code ~ '^[a-z_]+$'),
  name            text not null,
  is_system       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);

-- Гранты «роль → право» (Д-31). Каталог кодов — private.permission_catalog().
create table public.permissions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  role_id         uuid not null,
  code            text not null check (code ~ '^[a-z_]+\.[a-z_]+$'),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (role_id, organization_id) references public.roles (id, organization_id) on delete cascade,
  unique (role_id, code)
);
create index on public.permissions (organization_id);
create index on public.permissions (code);

create table public.member_roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  member_id       uuid not null,
  role_id         uuid not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (member_id, organization_id) references public.organization_members (id, organization_id) on delete cascade,
  foreign key (role_id, organization_id) references public.roles (id, organization_id) on delete cascade,
  unique (member_id, role_id)
);
create index on public.member_roles (organization_id);
create index on public.member_roles (role_id);

-- -------------------------------------------------------------------------------------
-- 4. Объекты
-- -------------------------------------------------------------------------------------
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code            text not null check (length(trim(code)) > 0),
  name            text not null check (length(trim(name)) > 0),
  address         text,
  status          public.project_status not null default 'ACTIVE',
  start_date      date,
  end_date        date,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.project_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  member_id       uuid not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (member_id, organization_id) references public.organization_members (id, organization_id) on delete cascade,
  unique (project_id, member_id)
);
create index on public.project_members (organization_id);
create index on public.project_members (member_id, project_id);

create table public.blocks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  name            text not null check (length(trim(name)) > 0),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  unique (project_id, name),
  unique (id, project_id)
);
create index on public.blocks (organization_id);

create table public.floors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  block_id        uuid not null,
  name            text not null check (length(trim(name)) > 0),
  level           int,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (block_id, project_id) references public.blocks (id, project_id) on delete cascade,
  unique (block_id, name),
  unique (id, block_id)
);
create index on public.floors (organization_id);
create index on public.floors (project_id);

create table public.warehouses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  name            text not null check (length(trim(name)) > 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  unique (project_id),                 -- Д-22: один склад на объект
  unique (id, organization_id, project_id)
);
create index on public.warehouses (organization_id);

-- -------------------------------------------------------------------------------------
-- 5. Справочники
-- -------------------------------------------------------------------------------------
create table public.units_of_measure (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code            text not null check (length(trim(code)) > 0),
  name            text not null check (length(trim(name)) > 0),
  decimals        smallint not null default 3 check (decimals between 0 and 4),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);

create table public.materials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code            text,
  name            text not null check (length(trim(name)) > 0),
  unit_id         uuid not null,
  category        text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (unit_id, organization_id) references public.units_of_measure (id, organization_id),
  unique (id, organization_id)
);
create unique index materials_org_code_key on public.materials (organization_id, code) where code is not null;
create index on public.materials (organization_id, name);
create index on public.materials (unit_id);

create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name            text not null check (length(trim(name)) > 0),
  tax_id          text,
  phone           text,
  contact_person  text,
  address         text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index suppliers_org_tax_id_key on public.suppliers (organization_id, tax_id) where tax_id is not null;
create index on public.suppliers (organization_id, name);

-- -------------------------------------------------------------------------------------
-- 6. Аудит и нумерация
-- -------------------------------------------------------------------------------------
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  project_id      uuid,
  actor_id        uuid,
  occurred_at     timestamptz not null default now(),
  table_name      text not null,
  record_id       uuid,
  action          text not null,
  doc_type        public.document_type,
  old_data        jsonb,
  new_data        jsonb,
  idempotency_key uuid
);
create index on public.audit_logs (organization_id, table_name, record_id);
create index on public.audit_logs using brin (occurred_at);

create table public.document_sequences (
  organization_id uuid not null references public.organizations (id),
  doc_type        public.document_type not null,
  year            int not null,
  last_value      bigint not null default 0,
  primary key (organization_id, doc_type, year)
);

-- -------------------------------------------------------------------------------------
-- 7. Хелперы прав (§5.2). SECURITY DEFINER: читают таблицы доступа в обход RLS,
--    иначе политики на этих таблицах ссылались бы сами на себя.
-- -------------------------------------------------------------------------------------
create function private.member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.organization_members m
  where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.is_active
$$;

create function private.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.member_id(p_org) is not null
$$;

create function private.is_aal2() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

-- Д-29: привилегированные роли обязаны входить со вторым фактором.
create function private.requires_mfa(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    join public.roles r on r.id = mr.role_id
    where mr.member_id = private.member_id(p_org)
      and r.code in ('org_admin', 'accountant', 'cashier')
  )
$$;

create function private.has_permission(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.member_roles mr
      join public.permissions p on p.role_id = mr.role_id
      where mr.member_id = private.member_id(p_org) and p.code = p_perm
    )
    and (private.is_aal2() or not private.requires_mfa(p_org))
$$;

create function private.has_project_access(p_org uuid, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.id = private.member_id(p_org)
      and (m.all_projects or exists (
        select 1 from public.project_members pm
        where pm.member_id = m.id and pm.project_id = p_project))
  )
$$;

create function private.can(p_org uuid, p_project uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_org, p_perm)
     and (p_project is null or private.has_project_access(p_org, p_project))
$$;

-- Каталог прав по умолчанию (§3 ARCHITECTURE.md с поправками Д-13, Д-26). После создания
-- организации матрица живёт в таблице permissions и правится данными.
create function private.permission_catalog()
returns table (role_code text, role_name text, perm_code text)
language sql immutable set search_path = '' as $$
  with roles(code, name) as (values
    ('accountant', 'Материальный бухгалтер'),
    ('warehouse', 'Заведующий складом'),
    ('cashier', 'Кассир'),
    ('foreman', 'Прораб'),
    ('project_manager', 'Управляющий проектом'),
    ('org_admin', 'Администратор организации')
  ), grants(role_code, perm) as (values
    ('accountant', 'projects.view'), ('accountant', 'catalog.manage'),
    ('accountant', 'purchase_requests.view'), ('accountant', 'purchase_requests.manage'),
    ('accountant', 'prices.view'), ('accountant', 'supplier_invoices.view'),
    ('accountant', 'supplier_invoices.manage'), ('accountant', 'stock.view'),
    ('accountant', 'goods_receipts.approve_correction'), ('accountant', 'payables.view'),
    ('accountant', 'payment_requests.view'), ('accountant', 'payment_requests.approve'),
    ('accountant', 'cash.view'), ('accountant', 'crews.view'), ('accountant', 'work_acts.view'),
    ('accountant', 'tasks.view'), ('accountant', 'reports.view'), ('accountant', 'audit.view'),

    ('warehouse', 'projects.view'), ('warehouse', 'purchase_requests.view'),
    ('warehouse', 'supplier_invoices.view'), ('warehouse', 'stock.view'),
    ('warehouse', 'goods_receipts.post'), ('warehouse', 'material_issues.post'),
    ('warehouse', 'tasks.view'), ('warehouse', 'tasks.execute'),

    ('cashier', 'projects.view'), ('cashier', 'supplier_invoices.view'), ('cashier', 'payables.view'),
    ('cashier', 'payment_requests.view'), ('cashier', 'payment_requests.create'),
    ('cashier', 'cash.view'), ('cashier', 'cash.post'), ('cashier', 'cash.reverse'),
    ('cashier', 'cash_accounts.manage'), ('cashier', 'crews.view'), ('cashier', 'work_acts.view'),
    ('cashier', 'tasks.view'), ('cashier', 'tasks.execute'), ('cashier', 'reports.view'),

    ('foreman', 'projects.view'), ('foreman', 'stock.view_own_crews'), ('foreman', 'crews.view'),
    ('foreman', 'crews.manage'), ('foreman', 'work_acts.view'), ('foreman', 'work_acts.create'),
    ('foreman', 'tasks.view'), ('foreman', 'tasks.execute'),

    ('project_manager', 'projects.view'), ('project_manager', 'projects.manage'),
    ('project_manager', 'purchase_requests.view'), ('project_manager', 'prices.view'),
    ('project_manager', 'supplier_invoices.view'), ('project_manager', 'stock.view'),
    ('project_manager', 'payables.view'), ('project_manager', 'payment_requests.view'),
    ('project_manager', 'cash.view'), ('project_manager', 'crews.view'),
    ('project_manager', 'crews.manage'), ('project_manager', 'work_acts.view'),
    ('project_manager', 'work_acts.approve'), ('project_manager', 'tasks.view'),
    ('project_manager', 'tasks.manage'), ('project_manager', 'reports.view'),
    ('project_manager', 'audit.view'),

    ('org_admin', 'projects.view'), ('org_admin', 'projects.manage'),
    ('org_admin', 'members.manage'), ('org_admin', 'catalog.manage'),
    ('org_admin', 'cash_accounts.manage'), ('org_admin', 'payment_requests.view'),
    ('org_admin', 'payment_requests.approve_payroll'), -- TODO(TZ-open): Д-13, зарплаты и выплаты вне актов
    ('org_admin', 'audit.view')
  )
  select r.code, r.name, g.perm from roles r join grants g on g.role_code = r.code
$$;

-- Роли, которые по умолчанию видят все объекты (Д-27).
create function private.role_defaults_all_projects(p_role_codes text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p_role_codes && array['accountant', 'cashier', 'org_admin']
$$;

-- -------------------------------------------------------------------------------------
-- 8. Аудит: универсальный триггер (§2.8). Пишет снимки строк; читать — только audit.view.
-- -------------------------------------------------------------------------------------
create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org uuid := case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid
                     else (v_row ->> 'organization_id')::uuid end;
begin
  insert into public.audit_logs (organization_id, project_id, actor_id, table_name, record_id,
                                 action, old_data, new_data)
  values (v_org, (v_row ->> 'project_id')::uuid, (select auth.uid()), tg_table_name,
          (v_row ->> 'id')::uuid, tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return null;
end $$;

-- -------------------------------------------------------------------------------------
-- 9. Инварианты доступа
-- -------------------------------------------------------------------------------------

-- В организации всегда остаётся хотя бы один активный org_admin: защита от «запереть всех».
create function private.ensure_active_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := coalesce((to_jsonb(new) ->> 'organization_id')::uuid,
                         (to_jsonb(old) ->> 'organization_id')::uuid);
begin
  if exists (select 1 from public.organizations o where o.id = v_org)
     and not exists (
       select 1 from public.member_roles mr
       join public.roles r on r.id = mr.role_id and r.code = 'org_admin'
       join public.organization_members m on m.id = mr.member_id and m.is_active
       where mr.organization_id = v_org)
  then
    raise exception using errcode = 'P0001', message = 'BF_LAST_ADMIN',
      detail = 'В организации должен остаться хотя бы один активный администратор';
  end if;
  return null;
end $$;

-- Создатель объекта становится его участником (Д-28); у объекта сразу есть склад (Д-22).
create function private.after_project_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := private.member_id(new.organization_id);
begin
  if v_member is not null then
    insert into public.project_members (organization_id, project_id, member_id, created_by)
    values (new.organization_id, new.id, v_member, new.created_by)
    on conflict do nothing;
  end if;
  insert into public.warehouses (organization_id, project_id, name, created_by)
  values (new.organization_id, new.id, 'Склад ' || new.name, new.created_by);
  return null;
end $$;

-- -------------------------------------------------------------------------------------
-- 10. Нумерация документов (§7, Д-10): без пропусков, вызывается внутри транзакции проведения.
-- -------------------------------------------------------------------------------------
create function private.document_prefix(p_doc_type public.document_type) returns text
language sql immutable set search_path = '' as $$
  select case p_doc_type
    when 'PURCHASE_REQUEST' then 'ЗК'
    when 'SUPPLIER_INVOICE' then 'НК'
    when 'GOODS_RECEIPT'    then 'ПРМ'
    when 'MATERIAL_ISSUE'   then 'ВДЧ'
    when 'MATERIAL_RETURN'  then 'ВЗВ'
    when 'PAYMENT_REQUEST'  then 'СЧ'
    when 'CASH_IN'          then 'ПКО'
    when 'CASH_OUT'         then 'РКО'
    when 'WORK_ACT'         then 'АКТ'
    when 'TASK'             then 'ЗД'
  end
$$;

create function private.next_document_number(
  p_org uuid, p_doc_type public.document_type, p_doc_date date
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_year int := extract(year from p_doc_date)::int;
  v_next bigint;
begin
  insert into public.document_sequences as s (organization_id, doc_type, year, last_value)
  values (p_org, p_doc_type, v_year, 1)
  on conflict (organization_id, doc_type, year)
  do update set last_value = s.last_value + 1
  returning s.last_value into v_next;

  return private.document_prefix(p_doc_type) || '-' || v_year || '-' || lpad(v_next::text, 6, '0');
end $$;

-- -------------------------------------------------------------------------------------
-- 11. RPC для приложения и скриптов
-- -------------------------------------------------------------------------------------

-- Доступы текущего пользователя: организации, роли, права, объекты. Для гарда и меню.
-- Права уже учитывают MFA (без aal2 у привилегированного пользователя список пуст).
create function public.my_access() returns jsonb
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
  where m.user_id = (select auth.uid()) and m.is_active
$$;

-- Для proxy.ts: нужен ли пользователю второй фактор хотя бы в одной организации (Д-29).
create function public.current_user_requires_mfa() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    join public.member_roles mr on mr.member_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.user_id = (select auth.uid()) and m.is_active
      and r.code in ('org_admin', 'accountant', 'cashier')
  )
$$;

-- Создание организации и первого org_admin. Только service_role (скрипт npm run org:create).
create function public.create_organization(
  p_name text, p_admin_user_id uuid, p_admin_full_name text, p_admin_email text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_member uuid;
begin
  insert into public.organizations (name, created_by) values (trim(p_name), p_admin_user_id)
  returning id into v_org;

  insert into public.roles (organization_id, code, name, created_by)
  select distinct v_org, c.role_code, c.role_name, p_admin_user_id from private.permission_catalog() c;

  insert into public.permissions (organization_id, role_id, code, created_by)
  select v_org, r.id, c.perm_code, p_admin_user_id
  from private.permission_catalog() c
  join public.roles r on r.organization_id = v_org and r.code = c.role_code;

  insert into public.organization_members
    (organization_id, user_id, full_name, email, all_projects, invited_at, created_by)
  values (v_org, p_admin_user_id, trim(p_admin_full_name), lower(trim(p_admin_email)), true, now(),
          p_admin_user_id)
  returning id into v_member;

  insert into public.member_roles (organization_id, member_id, role_id, created_by)
  select v_org, v_member, r.id, p_admin_user_id
  from public.roles r where r.organization_id = v_org and r.code = 'org_admin';

  -- Базовые единицы измерения: справочник сразу пригоден к работе.
  insert into public.units_of_measure (organization_id, code, name, decimals, created_by)
  values (v_org, 'шт', 'Штука', 0, p_admin_user_id), (v_org, 'кг', 'Килограмм', 3, p_admin_user_id),
         (v_org, 'т', 'Тонна', 3, p_admin_user_id), (v_org, 'м', 'Метр', 2, p_admin_user_id),
         (v_org, 'м²', 'Квадратный метр', 2, p_admin_user_id),
         (v_org, 'м³', 'Кубический метр', 3, p_admin_user_id),
         (v_org, 'л', 'Литр', 2, p_admin_user_id), (v_org, 'меш', 'Мешок', 0, p_admin_user_id);

  return v_org;
end $$;

-- Поиск пользователя Auth по email: приглашение человека, у которого уже есть учётная запись
-- (например, в другой организации). Только service_role.
create function public.find_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;

-- Добавление участника (после того как сервер создал/пригласил пользователя в Auth).
-- Вызывается от имени администратора: права проверяются здесь, не в приложении.
create function public.add_member(
  p_org uuid, p_user_id uuid, p_email text, p_full_name text, p_role_codes text[],
  p_all_projects boolean, p_project_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
  v_bad text;
begin
  if not private.has_permission(p_org, 'members.manage') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  if coalesce(array_length(p_role_codes, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'BF_ROLE_REQUIRED';
  end if;
  select c into v_bad from unnest(p_role_codes) c
  where not exists (select 1 from public.roles r where r.organization_id = p_org and r.code = c) limit 1;
  if v_bad is not null then
    raise exception using errcode = 'P0001', message = 'BF_UNKNOWN_ROLE', detail = v_bad;
  end if;

  insert into public.organization_members
    (organization_id, user_id, full_name, email, all_projects, invited_at, invited_by)
  values (p_org, p_user_id, trim(p_full_name), lower(trim(p_email)), p_all_projects, now(),
          (select auth.uid()))
  on conflict (organization_id, user_id) do nothing
  returning id into v_member;
  if v_member is null then
    raise exception using errcode = 'P0001', message = 'BF_ALREADY_MEMBER';
  end if;

  insert into public.member_roles (organization_id, member_id, role_id)
  select p_org, v_member, r.id from public.roles r
  where r.organization_id = p_org and r.code = any (p_role_codes);

  insert into public.project_members (organization_id, project_id, member_id)
  select p_org, p.id, v_member from public.projects p
  where p.organization_id = p_org and p.id = any (coalesce(p_project_ids, '{}'));

  return v_member;
end $$;

-- Полная замена ролей участника. Последнего администратора защищает триггер.
create function public.set_member_roles(p_member_id uuid, p_role_codes text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (select organization_id from public.organization_members where id = p_member_id);
begin
  if v_org is null or not private.has_permission(v_org, 'members.manage') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  if coalesce(array_length(p_role_codes, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'BF_ROLE_REQUIRED';
  end if;
  delete from public.member_roles mr
  using public.roles r
  where mr.member_id = p_member_id and r.id = mr.role_id and not (r.code = any (p_role_codes));
  insert into public.member_roles (organization_id, member_id, role_id)
  select v_org, p_member_id, r.id from public.roles r
  where r.organization_id = v_org and r.code = any (p_role_codes)
  on conflict (member_id, role_id) do nothing;
end $$;

-- Полная замена списка объектов участника.
create function public.set_member_projects(p_member_id uuid, p_all_projects boolean, p_project_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (select organization_id from public.organization_members where id = p_member_id);
begin
  if v_org is null or not private.has_permission(v_org, 'members.manage') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  update public.organization_members set all_projects = p_all_projects where id = p_member_id;
  delete from public.project_members
  where member_id = p_member_id and not (project_id = any (coalesce(p_project_ids, '{}')));
  insert into public.project_members (organization_id, project_id, member_id)
  select v_org, p.id, p_member_id from public.projects p
  where p.organization_id = v_org and p.id = any (coalesce(p_project_ids, '{}'))
  on conflict (project_id, member_id) do nothing;
end $$;

-- Правка участника одной транзакцией: карточка, активность, роли, объекты.
create function public.update_member(
  p_member_id uuid, p_full_name text, p_phone text, p_is_active boolean,
  p_role_codes text[], p_all_projects boolean, p_project_ids uuid[]
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (select organization_id from public.organization_members where id = p_member_id);
begin
  if v_org is null or not private.has_permission(v_org, 'members.manage') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  update public.organization_members
     set full_name = trim(p_full_name), phone = nullif(trim(p_phone), ''), is_active = p_is_active
   where id = p_member_id;
  perform public.set_member_roles(p_member_id, p_role_codes);
  perform public.set_member_projects(p_member_id, p_all_projects, p_project_ids);
end $$;

-- -------------------------------------------------------------------------------------
-- 12. Триггеры
-- -------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['organizations', 'organization_members', 'roles', 'permissions',
    'member_roles', 'projects', 'project_members', 'blocks', 'floors', 'warehouses',
    'units_of_measure', 'materials', 'suppliers']
  loop
    execute format('create trigger set_created_by before insert on public.%I
                    for each row execute function private.set_created_by()', t);
    execute format('create trigger before_update_std before update on public.%I
                    for each row execute function private.before_update_std()', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t);
  end loop;
end $$;

create trigger ensure_active_admin
  after update or delete on public.member_roles
  for each row execute function private.ensure_active_admin();
create trigger ensure_active_admin
  after update of is_active on public.organization_members
  for each row execute function private.ensure_active_admin();

create trigger after_project_insert
  after insert on public.projects
  for each row execute function private.after_project_insert();

-- -------------------------------------------------------------------------------------
-- 13. RLS
-- -------------------------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.roles                enable row level security;
alter table public.permissions          enable row level security;
alter table public.member_roles         enable row level security;
alter table public.projects             enable row level security;
alter table public.project_members      enable row level security;
alter table public.blocks               enable row level security;
alter table public.floors               enable row level security;
alter table public.warehouses           enable row level security;
alter table public.units_of_measure     enable row level security;
alter table public.materials            enable row level security;
alter table public.suppliers            enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.document_sequences   enable row level security;

-- Организация: видят участники; правят название/реквизиты администраторы.
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (private.has_permission(id, 'members.manage'))
  with check (private.has_permission(id, 'members.manage'));

-- Участники: коллеги видят друг друга (исполнители задач, ответственные).
-- Добавление и роли — только через RPC add_member / set_member_*; здесь правка карточки.
create policy organization_members_select on public.organization_members for select to authenticated
  using (private.is_member(organization_id));
create policy organization_members_update on public.organization_members for update to authenticated
  using (private.has_permission(organization_id, 'members.manage'))
  with check (private.has_permission(organization_id, 'members.manage'));

-- Роли и матрица прав: читают все участники (для UI); правка — миграциями/скриптами.
create policy roles_select on public.roles for select to authenticated
  using (private.is_member(organization_id));
create policy permissions_select on public.permissions for select to authenticated
  using (private.is_member(organization_id));
create policy member_roles_select on public.member_roles for select to authenticated
  using (private.is_member(organization_id));
create policy project_members_select on public.project_members for select to authenticated
  using (private.is_member(organization_id));

-- Объекты: только назначенные (или all_projects) и с правом projects.view (US-09).
create policy projects_select on public.projects for select to authenticated
  using (private.can(organization_id, id, 'projects.view'));
create policy projects_insert on public.projects for insert to authenticated
  with check (private.has_permission(organization_id, 'projects.manage'));
create policy projects_update on public.projects for update to authenticated
  using (private.can(organization_id, id, 'projects.manage'))
  with check (private.can(organization_id, id, 'projects.manage'));

create policy blocks_select on public.blocks for select to authenticated
  using (private.can(organization_id, project_id, 'projects.view'));
create policy blocks_insert on public.blocks for insert to authenticated
  with check (private.can(organization_id, project_id, 'projects.manage'));
create policy blocks_update on public.blocks for update to authenticated
  using (private.can(organization_id, project_id, 'projects.manage'))
  with check (private.can(organization_id, project_id, 'projects.manage'));
create policy blocks_delete on public.blocks for delete to authenticated
  using (private.can(organization_id, project_id, 'projects.manage'));

create policy floors_select on public.floors for select to authenticated
  using (private.can(organization_id, project_id, 'projects.view'));
create policy floors_insert on public.floors for insert to authenticated
  with check (private.can(organization_id, project_id, 'projects.manage'));
create policy floors_update on public.floors for update to authenticated
  using (private.can(organization_id, project_id, 'projects.manage'))
  with check (private.can(organization_id, project_id, 'projects.manage'));
create policy floors_delete on public.floors for delete to authenticated
  using (private.can(organization_id, project_id, 'projects.manage'));

create policy warehouses_select on public.warehouses for select to authenticated
  using (private.can(organization_id, project_id, 'projects.view'));
create policy warehouses_update on public.warehouses for update to authenticated
  using (private.can(organization_id, project_id, 'projects.manage'))
  with check (private.can(organization_id, project_id, 'projects.manage'));

-- Справочники: читают все участники организации; правит catalog.manage.
create policy units_select on public.units_of_measure for select to authenticated
  using (private.is_member(organization_id));
create policy units_insert on public.units_of_measure for insert to authenticated
  with check (private.has_permission(organization_id, 'catalog.manage'));
create policy units_update on public.units_of_measure for update to authenticated
  using (private.has_permission(organization_id, 'catalog.manage'))
  with check (private.has_permission(organization_id, 'catalog.manage'));

create policy materials_select on public.materials for select to authenticated
  using (private.is_member(organization_id));
create policy materials_insert on public.materials for insert to authenticated
  with check (private.has_permission(organization_id, 'catalog.manage'));
create policy materials_update on public.materials for update to authenticated
  using (private.has_permission(organization_id, 'catalog.manage'))
  with check (private.has_permission(organization_id, 'catalog.manage'));

create policy suppliers_select on public.suppliers for select to authenticated
  using (private.is_member(organization_id));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (private.has_permission(organization_id, 'catalog.manage'));
create policy suppliers_update on public.suppliers for update to authenticated
  using (private.has_permission(organization_id, 'catalog.manage'))
  with check (private.has_permission(organization_id, 'catalog.manage'));

-- Аудит: только чтение и только с audit.view (в снимках будут цены — §5.4).
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (private.has_permission(organization_id, 'audit.view'));

-- document_sequences: политик нет — доступ только функциями.

-- -------------------------------------------------------------------------------------
-- 14. Гранты. Полностью явные: умолчания Supabase различаются между версиями и локальным/облачным
--     окружением (локально authenticated по умолчанию получает TRUNCATE, который обходит RLS).
-- -------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
-- TRUNCATE не получит никто и в будущих таблицах.
alter default privileges in schema public revoke truncate on tables from authenticated, service_role;

-- service_role (серверные скрипты; RLS обходит) — CRUD без TRUNCATE.
grant select, insert, update, delete on all tables in schema public to service_role;

-- authenticated: доступ и матрица прав — только чтение; изменения через RPC.
grant select on public.organizations, public.organization_members, public.roles, public.permissions,
  public.member_roles, public.project_members to authenticated;
grant update (name, tax_id, default_currency, timezone) on public.organizations to authenticated;
grant update (full_name, phone, is_active) on public.organization_members to authenticated;

-- Объекты. Объекты и склады не удаляются (будут ссылки из документов) — архив статусом/флагом.
grant select, insert on public.projects to authenticated;
grant update (code, name, address, status, start_date, end_date) on public.projects to authenticated;
grant select, insert, delete on public.blocks, public.floors to authenticated;
grant update (name, sort_order) on public.blocks to authenticated;
grant update (name, level, sort_order) on public.floors to authenticated;
grant select on public.warehouses to authenticated;
grant update (name, is_active) on public.warehouses to authenticated;

-- Справочники: без удаления — архив флагом is_active.
grant select, insert on public.units_of_measure, public.materials, public.suppliers to authenticated;
grant update (code, name, decimals) on public.units_of_measure to authenticated;
grant update (code, name, unit_id, category, is_active) on public.materials to authenticated;
grant update (name, tax_id, phone, contact_person, address, is_active) on public.suppliers to authenticated;

-- Аудит — только чтение (RLS: audit.view). document_sequences — без доступа.
grant select on public.audit_logs to authenticated;

-- Хелперы private вызываются из RLS-политик от имени пользователя.
grant execute on function private.member_id(uuid), private.is_member(uuid), private.is_aal2(),
  private.requires_mfa(uuid), private.has_permission(uuid, text),
  private.has_project_access(uuid, uuid), private.can(uuid, uuid, text)
  to authenticated, service_role;

grant execute on function public.my_access(), public.current_user_requires_mfa(),
  public.add_member(uuid, uuid, text, text, text[], boolean, uuid[]),
  public.set_member_roles(uuid, text[]),
  public.set_member_projects(uuid, boolean, uuid[]),
  public.update_member(uuid, text, text, boolean, text[], boolean, uuid[])
  to authenticated;

-- Организацию создаёт только серверный скрипт npm run org:create.
grant execute on function public.create_organization(text, uuid, text, text) to service_role;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- ROLLBACK (только до появления данных — удаляет всю схему Foundation):
--   drop schema private cascade;
--   drop table public.audit_logs, public.document_sequences, public.suppliers, public.materials,
--     public.units_of_measure, public.warehouses, public.floors, public.blocks, public.project_members,
--     public.projects, public.member_roles, public.permissions, public.roles,
--     public.organization_members, public.organizations cascade;
--   drop function public.my_access(), public.current_user_requires_mfa(),
--     public.create_organization(text, uuid, text, text), public.find_user_id_by_email(text),
--     public.add_member(uuid, uuid, text, text, text[], boolean, uuid[]),
--     public.set_member_roles(uuid, text[]), public.set_member_projects(uuid, boolean, uuid[]),
--     public.update_member(uuid, text, text, boolean, text[], boolean, uuid[]);
--   drop type public.document_type, public.project_status;
