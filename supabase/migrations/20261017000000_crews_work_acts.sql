-- =====================================================================================
-- 0011 Фаза 4: бригады, договорные тарифы, акты выполненных работ (BP-05; §2.7, §4.6).
-- Прораб создаёт акт по своему объекту → управляющий закреплённого объекта утверждает или
-- отклоняет (согласующий ≠ автор) → утверждение создаёт обязательство CREW (Д-63) → кассир
-- оплачивает расходом CREW_ACT. Утверждённый акт неизменяем. Запись — только функциями (Д-58).
-- =====================================================================================

create type public.work_act_status as enum ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');
create type public.task_status as enum ('NEW', 'IN_PROGRESS', 'ON_REVIEW', 'DONE', 'BLOCKED', 'CANCELLED');

-- -------------------------------------------------------------------------------------
-- 1. Права. Д-69: тарифы — только управляющий (work_rates.manage). Д-71: кассир видит
--    только утверждённые акты (work_acts.view_approved вместо work_acts.view).
-- -------------------------------------------------------------------------------------
create or replace function private.permission_catalog()
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
    ('accountant', 'opening_balances.manage'),
    ('accountant', 'cash.reverse_approve'), ('accountant', 'cash.reversals_report'),

    ('warehouse', 'projects.view'), ('warehouse', 'purchase_requests.view'),
    ('warehouse', 'supplier_invoices.view'), ('warehouse', 'stock.view'),
    ('warehouse', 'goods_receipts.post'), ('warehouse', 'material_issues.post'),
    ('warehouse', 'tasks.execute'),

    ('cashier', 'projects.view'), ('cashier', 'supplier_invoices.view'), ('cashier', 'payables.view'),
    ('cashier', 'payment_requests.view'), ('cashier', 'payment_requests.create'),
    ('cashier', 'cash.view'), ('cashier', 'cash.post'), ('cashier', 'cash.reverse'),
    ('cashier', 'cash_accounts.manage'), ('cashier', 'crews.view'), ('cashier', 'work_acts.view_approved'),
    ('cashier', 'tasks.execute'), ('cashier', 'reports.view'),

    ('foreman', 'projects.view'), ('foreman', 'stock.view_own_crews'), ('foreman', 'crews.view'),
    ('foreman', 'crews.manage'), ('foreman', 'work_acts.view'), ('foreman', 'work_acts.create'),
    ('foreman', 'tasks.execute'),

    ('project_manager', 'projects.view'), ('project_manager', 'projects.manage'),
    ('project_manager', 'purchase_requests.view'), ('project_manager', 'prices.view'),
    ('project_manager', 'supplier_invoices.view'), ('project_manager', 'stock.view'),
    ('project_manager', 'payables.view'), ('project_manager', 'payment_requests.view'),
    ('project_manager', 'cash.view'), ('project_manager', 'crews.view'),
    -- TODO(TZ-open): кто устанавливает договорные тарифы (Д-69) — пока управляющий.
    ('project_manager', 'crews.manage'), ('project_manager', 'work_rates.manage'),
    ('project_manager', 'work_acts.view'),
    ('project_manager', 'work_acts.approve'), ('project_manager', 'tasks.view'),
    ('project_manager', 'tasks.manage'), ('project_manager', 'reports.view'),
    ('project_manager', 'audit.view'),

    ('org_admin', 'projects.view'), ('org_admin', 'projects.manage'),
    ('org_admin', 'members.manage'), ('org_admin', 'catalog.manage'),
    ('org_admin', 'cash_accounts.manage'), ('org_admin', 'payment_requests.view'),
    ('org_admin', 'payment_requests.approve_payroll'), -- TODO(TZ-open): Д-13, зарплаты и выплаты вне актов
    ('org_admin', 'audit.view'), ('org_admin', 'opening_balances.manage'),
    ('org_admin', 'cash.reversals_report')
  )
  select r.code, r.name, g.perm from roles r join grants g on g.role_code = r.code
$$;

insert into public.permissions (organization_id, role_id, code)
select r.organization_id, r.id, c.perm_code
from public.roles r join private.permission_catalog() c on c.role_code = r.code
on conflict (role_id, code) do nothing;
-- Д-71: у кассира больше нет полного просмотра актов (отклонённые и черновики ему не видны).
-- Д-74: исполнители (склад, кассир, прораб) видят только назначенные им задачи — tasks.view снят.
delete from public.permissions p using public.roles r
where p.role_id = r.id
  and ((r.code = 'cashier' and p.code = 'work_acts.view')
    or (r.code in ('warehouse', 'cashier', 'foreman') and p.code = 'tasks.view'));

-- -------------------------------------------------------------------------------------
-- 2. Состав бригады — люди, а не пользователи системы (справочник, пишется под RLS).
-- -------------------------------------------------------------------------------------
create table public.crew_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  crew_id         uuid not null,
  full_name       text not null check (length(trim(full_name)) > 0),
  phone           text,
  position        text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (crew_id, organization_id) references public.crews (id, organization_id)
);
create index on public.crew_members (organization_id);
create index on public.crew_members (crew_id);

-- -------------------------------------------------------------------------------------
-- 3. Договорные тарифы (Д-70): история строками с датой начала; изменение тарифа = новая
--    строка. project_id NULL — тариф бригады для всех объектов; тариф объекта важнее.
-- -------------------------------------------------------------------------------------
create table public.work_rates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  crew_id         uuid not null,
  project_id      uuid,
  work_type       text not null check (length(trim(work_type)) > 0),
  unit_id         uuid not null,
  rate            numeric(18, 4) not null check (rate > 0),
  currency        char(3) not null default 'TJS' check (currency ~ '^[A-Z]{3}$'),
  valid_from      date not null,
  note            text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (crew_id, organization_id) references public.crews (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (unit_id, organization_id) references public.units_of_measure (id, organization_id),
  unique nulls not distinct (crew_id, project_id, work_type, valid_from),
  unique (id, organization_id)
);
create index on public.work_rates (organization_id);
create index on public.work_rates (project_id);
create index on public.work_rates (crew_id, work_type, valid_from desc);

-- Действующий тариф на дату: сначала тариф объекта, затем общий; внутри — последний по дате.
create function private.current_work_rate(p_crew uuid, p_project uuid, p_work_type text, p_date date)
returns public.work_rates
language sql stable security definer set search_path = '' as $$
  select r.* from public.work_rates r
  where r.crew_id = p_crew and r.work_type = p_work_type and r.valid_from <= p_date
    and (r.project_id = p_project or r.project_id is null)
  order by (r.project_id is null), r.valid_from desc
  limit 1
$$;

-- -------------------------------------------------------------------------------------
-- 4. Акт выполненных работ
-- -------------------------------------------------------------------------------------
create table public.work_completion_acts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  crew_id         uuid not null,
  number          text,
  doc_date        date not null default private.today(),
  period_from     date,
  period_to       date,
  status          public.work_act_status not null default 'DRAFT',
  currency        char(3) not null default 'TJS' check (currency ~ '^[A-Z]{3}$'),
  total_amount    numeric(18, 2) not null default 0,   -- кэш Σ строк
  replaces_act_id uuid references public.work_completion_acts (id),   -- «на основе отклонённого»
  note            text,
  status_comment  text,
  posted_at       timestamptz,                          -- отправлен управляющему
  posted_by       uuid references auth.users (id),
  approved_at     timestamptz,
  approved_by     uuid references auth.users (id),
  rejected_at     timestamptz,
  rejected_by     uuid references auth.users (id),
  reject_reason   text,
  cancelled_at    timestamptz,
  cancelled_by    uuid references auth.users (id),
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (crew_id, organization_id) references public.crews (id, organization_id),
  check (period_from is null or period_to is null or period_from <= period_to),
  -- Д-14: утверждает и отклоняет не автор.
  check (approved_by is null or approved_by <> created_by),
  check (rejected_by is null or rejected_by <> created_by),
  check (status <> 'REJECTED' or length(trim(reject_reason)) >= 3),
  unique (id, organization_id, project_id)
);
create unique index work_completion_acts_number_key on public.work_completion_acts (organization_id, number)
  where number is not null;
create index on public.work_completion_acts (organization_id, doc_date desc);
create index on public.work_completion_acts (project_id, status);
create index on public.work_completion_acts (crew_id);
create index on public.work_completion_acts (replaces_act_id);

create table public.work_completion_items (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null,
  project_id             uuid not null,
  work_completion_act_id uuid not null,
  line_no                int not null check (line_no > 0),
  work_rate_id           uuid not null references public.work_rates (id),
  work_type              text not null,
  unit_id                uuid not null,
  block_id               uuid,
  floor_id               uuid,
  quantity               numeric(18, 4) not null check (quantity > 0),
  rate                   numeric(18, 4) not null check (rate > 0),   -- снимок тарифа (Д-70)
  amount                 numeric(18, 2) generated always as (round(quantity * rate, 2)) stored,
  note                   text,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id),
  updated_at             timestamptz not null default now(),
  foreign key (work_completion_act_id, organization_id, project_id)
    references public.work_completion_acts (id, organization_id, project_id) on delete cascade,
  foreign key (unit_id, organization_id) references public.units_of_measure (id, organization_id),
  foreign key (block_id, project_id) references public.blocks (id, project_id),
  foreign key (floor_id, block_id) references public.floors (id, block_id),
  unique (work_completion_act_id, line_no)
);
create index on public.work_completion_items (organization_id);
create index on public.work_completion_items (project_id);
create index on public.work_completion_items (work_rate_id);

create function private.recalc_work_act_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(new.work_completion_act_id, old.work_completion_act_id);
begin
  update public.work_completion_acts
     set total_amount = coalesce((select sum(i.amount) from public.work_completion_items i
                                  where i.work_completion_act_id = v_id), 0)
   where id = v_id;
  return null;
end $$;

-- Утверждённый акт неизменяем (BP-05): меняются только поля отмены и статус → CANCELLED.
-- Удаляется только черновик.
create function private.guard_work_act() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_mutable text[] := array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'status_comment',
                            'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then
      raise exception using errcode = 'P0001', message = 'BF_DOCUMENT_LOCKED', detail = old.status::text;
    end if;
    return old;
  end if;
  if old.status in ('APPROVED', 'REJECTED', 'CANCELLED')
     and (to_jsonb(old) - v_mutable is distinct from to_jsonb(new) - v_mutable
          or (old.status <> 'APPROVED' and new.status <> old.status)) then
    raise exception using errcode = 'P0001', message = 'BF_DOCUMENT_LOCKED', detail = old.status::text;
  end if;
  return new;
end $$;

-- -------------------------------------------------------------------------------------
-- 5. Переходы статусов: каталог дополнен актами работ (§4.6) и задачами (§4.8).
-- -------------------------------------------------------------------------------------
create or replace function private.allowed_transition(p_table text, p_from text, p_to text) returns boolean
language sql immutable set search_path = '' as $$
  select (p_table, p_from, p_to) in (
    ('purchase_requests', 'DRAFT', 'ISSUED'), ('purchase_requests', 'DRAFT', 'CANCELLED'),
    ('purchase_requests', 'ISSUED', 'CANCELLED'),
    ('purchase_requests', 'ISSUED', 'PARTIALLY_RECEIVED'), ('purchase_requests', 'ISSUED', 'RECEIVED'),
    ('purchase_requests', 'PARTIALLY_RECEIVED', 'RECEIVED'), ('purchase_requests', 'PARTIALLY_RECEIVED', 'ISSUED'),
    ('purchase_requests', 'RECEIVED', 'PARTIALLY_RECEIVED'), ('purchase_requests', 'RECEIVED', 'ISSUED'),
    ('purchase_requests', 'PARTIALLY_RECEIVED', 'ACCOUNTING_REVIEW'),
    ('purchase_requests', 'RECEIVED', 'ACCOUNTING_REVIEW'),
    ('purchase_requests', 'ACCOUNTING_REVIEW', 'DISCREPANCY'),
    ('purchase_requests', 'DISCREPANCY', 'ACCOUNTING_REVIEW'),
    ('purchase_requests', 'ACCOUNTING_REVIEW', 'CLOSED'),
    ('supplier_invoices', 'ENTERED', 'UNDER_REVIEW'), ('supplier_invoices', 'UNDER_REVIEW', 'ENTERED'),
    ('supplier_invoices', 'UNDER_REVIEW', 'CONFIRMED'), ('supplier_invoices', 'ENTERED', 'CANCELLED'),
    ('supplier_invoices', 'UNDER_REVIEW', 'CANCELLED'), ('supplier_invoices', 'CONFIRMED', 'CANCELLED'),
    ('goods_receipts', 'DRAFT', 'POSTED'), ('goods_receipts', 'DRAFT', 'CORRECTION_APPROVAL'),
    ('goods_receipts', 'CORRECTION_APPROVAL', 'POSTED'), ('goods_receipts', 'CORRECTION_APPROVAL', 'DRAFT'),
    ('goods_receipts', 'POSTED', 'CORRECTED'),
    ('material_issues', 'DRAFT', 'POSTED'), ('material_issues', 'POSTED', 'REVERSED'),
    ('material_returns', 'DRAFT', 'POSTED'), ('material_returns', 'POSTED', 'REVERSED'),
    ('payment_requests', 'DRAFT', 'APPROVAL'), ('payment_requests', 'APPROVAL', 'APPROVED'),
    ('payment_requests', 'APPROVAL', 'DRAFT'),
    ('payment_requests', 'APPROVED', 'PARTIALLY_PAID'), ('payment_requests', 'APPROVED', 'PAID'),
    ('payment_requests', 'PARTIALLY_PAID', 'PAID'), ('payment_requests', 'PARTIALLY_PAID', 'APPROVED'),
    ('payment_requests', 'PAID', 'PARTIALLY_PAID'), ('payment_requests', 'PAID', 'APPROVED'),
    ('payment_requests', 'DRAFT', 'CANCELLED'), ('payment_requests', 'APPROVAL', 'CANCELLED'),
    ('payment_requests', 'APPROVED', 'CANCELLED'),
    ('cash_transactions', 'DRAFT', 'POSTED'), ('cash_transactions', 'POSTED', 'REVERSED'),
    ('opening_balances', 'DRAFT', 'POSTED'), ('opening_balances', 'POSTED', 'REVERSED'),
    -- Акт выполненных работ (§4.6, Д-72)
    ('work_completion_acts', 'DRAFT', 'REVIEW'), ('work_completion_acts', 'REVIEW', 'APPROVED'),
    ('work_completion_acts', 'REVIEW', 'REJECTED'), ('work_completion_acts', 'DRAFT', 'CANCELLED'),
    ('work_completion_acts', 'REVIEW', 'CANCELLED'), ('work_completion_acts', 'APPROVED', 'CANCELLED'),
    -- Задача (§4.8)
    ('tasks', 'NEW', 'IN_PROGRESS'), ('tasks', 'IN_PROGRESS', 'ON_REVIEW'),
    ('tasks', 'ON_REVIEW', 'DONE'), ('tasks', 'ON_REVIEW', 'IN_PROGRESS'),
    ('tasks', 'NEW', 'BLOCKED'), ('tasks', 'IN_PROGRESS', 'BLOCKED'), ('tasks', 'BLOCKED', 'IN_PROGRESS'),
    ('tasks', 'NEW', 'CANCELLED'), ('tasks', 'IN_PROGRESS', 'CANCELLED'),
    ('tasks', 'BLOCKED', 'CANCELLED'), ('tasks', 'ON_REVIEW', 'CANCELLED')
  )
$$;

-- -------------------------------------------------------------------------------------
-- 6. Триггеры
-- -------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['crew_members', 'work_rates', 'work_completion_acts', 'work_completion_items'] loop
    execute format('create trigger set_created_by before insert on public.%I
                    for each row execute function private.set_created_by()', t);
    execute format('create trigger before_update_std before update on public.%I
                    for each row execute function private.before_update_std()', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t);
  end loop;
end $$;

create trigger guard_document before update on public.work_completion_acts
  for each row execute function private.guard_document();
create trigger guard_work_act before update or delete on public.work_completion_acts
  for each row execute function private.guard_work_act();
create trigger guard_lines before insert or update or delete on public.work_completion_items
  for each row execute function private.guard_lines('work_completion_acts', 'work_completion_act_id', 'DRAFT');
create trigger recalc_work_act_total after insert or update or delete on public.work_completion_items
  for each row execute function private.recalc_work_act_total();
-- Тариф, на который ссылается строка акта, не меняется (история, Д-70).
create function private.guard_work_rate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.work_completion_items where work_rate_id = old.id) then
    raise exception using errcode = 'P0001', message = 'BF_RATE_IN_USE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard_work_rate before update or delete on public.work_rates
  for each row execute function private.guard_work_rate();

-- -------------------------------------------------------------------------------------
-- 7. RLS
-- -------------------------------------------------------------------------------------
alter table public.crew_members          enable row level security;
alter table public.work_rates            enable row level security;
alter table public.work_completion_acts  enable row level security;
alter table public.work_completion_items enable row level security;

create policy crew_members_select on public.crew_members for select to authenticated
  using (private.has_permission(organization_id, 'crews.view'));
create policy crew_members_insert on public.crew_members for insert to authenticated
  with check (private.has_permission(organization_id, 'crews.manage'));
create policy crew_members_update on public.crew_members for update to authenticated
  using (private.has_permission(organization_id, 'crews.manage'))
  with check (private.has_permission(organization_id, 'crews.manage'));

-- Тарифы — коммерческие данные: только с crews.view и доступом к объекту тарифа.
create policy work_rates_select on public.work_rates for select to authenticated
  using (private.can(organization_id, project_id, 'crews.view'));

-- Д-71: work_acts.view — все акты объекта; work_acts.view_approved (кассир) — только утверждённые.
create policy work_completion_acts_select on public.work_completion_acts for select to authenticated
  using (private.can(organization_id, project_id, 'work_acts.view')
         or (status = 'APPROVED' and private.can(organization_id, project_id, 'work_acts.view_approved')));
create policy work_completion_items_select on public.work_completion_items for select to authenticated
  using (exists (select 1 from public.work_completion_acts a where a.id = work_completion_act_id));

revoke all on public.crew_members, public.work_rates, public.work_completion_acts,
  public.work_completion_items from anon, authenticated;
grant select, insert on public.crew_members to authenticated;
grant update (full_name, phone, position, is_active) on public.crew_members to authenticated;
grant select on public.work_rates, public.work_completion_acts, public.work_completion_items to authenticated;
grant select, insert, update, delete on public.crew_members, public.work_rates, public.work_completion_acts,
  public.work_completion_items to service_role;

-- -------------------------------------------------------------------------------------
-- 8. Тарифы: добавить или исправить (исправить — только пока тариф не попал в акт).
-- -------------------------------------------------------------------------------------
create function public.save_work_rate(
  p_id uuid, p_crew_id uuid, p_project_id uuid, p_work_type text, p_unit_id uuid, p_rate numeric,
  p_currency text, p_valid_from date, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (select organization_id from public.crews where id = p_crew_id);
  v_row public.work_rates;
begin
  perform private.require(v_org is not null and private.can(v_org, p_project_id, 'work_rates.manage'),
                          'BF_FORBIDDEN', '42501');
  select * into v_row from public.work_rates where id = p_id for update;
  if found then
    perform private.require(v_row.organization_id = v_org, 'BF_FORBIDDEN', '42501');
    update public.work_rates
       set crew_id = p_crew_id, project_id = p_project_id, work_type = trim(p_work_type), unit_id = p_unit_id,
           rate = p_rate, currency = upper(coalesce(p_currency, 'TJS')), valid_from = p_valid_from,
           note = nullif(trim(p_note), '')
     where id = p_id;
  else
    insert into public.work_rates (id, organization_id, crew_id, project_id, work_type, unit_id, rate, currency,
      valid_from, note)
    values (p_id, v_org, p_crew_id, p_project_id, trim(p_work_type), p_unit_id, p_rate,
      upper(coalesce(p_currency, 'TJS')), p_valid_from, nullif(trim(p_note), ''));
  end if;
  return p_id;
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'BF_RATE_EXISTS';
end $$;

-- -------------------------------------------------------------------------------------
-- 9. Акт: черновик. p_lines: [{work_type, block_id, floor_id, quantity, note}].
--    Тариф подставляет сервер (снимок на дату акта); ручной тариф невозможен (Д-70).
-- -------------------------------------------------------------------------------------
create function private.fill_work_act_lines(p_act public.work_completion_acts, p_lines jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_line record;
  v_rate public.work_rates;
  v_currency char(3);
begin
  delete from public.work_completion_items where work_completion_act_id = p_act.id;
  for v_line in
    select l.ord::int as line_no, trim(l.v ->> 'work_type') as work_type,
           nullif(l.v ->> 'block_id', '')::uuid as block_id, nullif(l.v ->> 'floor_id', '')::uuid as floor_id,
           (l.v ->> 'quantity')::numeric as quantity, nullif(trim(l.v ->> 'note'), '') as note
    from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord)
  loop
    v_rate := private.current_work_rate(p_act.crew_id, p_act.project_id, v_line.work_type, p_act.doc_date);
    perform private.require(v_rate.id is not null, 'BF_NO_RATE', 'P0001', v_line.work_type);
    -- Валюта акта = валюте тарифов; разные валюты в одном акте не смешиваются (Д-68).
    perform private.require(v_currency is null or v_currency = v_rate.currency, 'BF_CURRENCY_MISMATCH');
    v_currency := v_rate.currency;
    insert into public.work_completion_items (organization_id, project_id, work_completion_act_id, line_no,
      work_rate_id, work_type, unit_id, block_id, floor_id, quantity, rate, note)
    values (p_act.organization_id, p_act.project_id, p_act.id, v_line.line_no, v_rate.id, v_rate.work_type,
      v_rate.unit_id, v_line.block_id, v_line.floor_id, v_line.quantity, v_rate.rate, v_line.note);
  end loop;
  if v_currency is not null then
    update public.work_completion_acts set currency = v_currency where id = p_act.id;
  end if;
end $$;

create function public.save_work_act_draft(
  p_id uuid, p_project_id uuid, p_crew_id uuid, p_doc_date date, p_period_from date, p_period_to date,
  p_note text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_doc public.work_completion_acts;
begin
  perform private.require(private.can(v_org, p_project_id, 'work_acts.create'), 'BF_FORBIDDEN', '42501');
  perform private.require(exists (select 1 from public.crews where id = p_crew_id and organization_id = v_org
                                  and is_active), 'BF_CREW_INACTIVE');

  select * into v_doc from public.work_completion_acts where id = p_id for update;
  if found then
    perform private.require(v_doc.organization_id = v_org and v_doc.project_id = p_project_id
                            and v_doc.created_by = (select auth.uid()), 'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    update public.work_completion_acts
       set crew_id = p_crew_id, doc_date = coalesce(p_doc_date, doc_date), period_from = p_period_from,
           period_to = p_period_to, note = nullif(trim(p_note), '')
     where id = p_id
    returning * into v_doc;
  else
    insert into public.work_completion_acts (id, organization_id, project_id, crew_id, doc_date, period_from,
      period_to, note)
    values (p_id, v_org, p_project_id, p_crew_id, coalesce(p_doc_date, private.today()), p_period_from,
      p_period_to, nullif(trim(p_note), ''))
    returning * into v_doc;
  end if;
  perform private.fill_work_act_lines(v_doc, p_lines);
  return p_id;
end $$;

create function public.delete_work_act_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.work_completion_acts;
begin
  select * into v_doc from public.work_completion_acts where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'work_acts.create')
                          and v_doc.created_by = (select auth.uid()), 'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
  delete from public.work_completion_acts where id = p_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 10. Акт: переходы (§4.6). Идемпотентны по ключу; параллельные решения сериализуются
--     блокировкой строки акта, обязательство — одно (UNIQUE source_doc_type, source_doc_id).
-- -------------------------------------------------------------------------------------
create function private.work_act_transition(
  p_id uuid, p_key uuid, p_operation text, p_comment text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.work_completion_acts;
  v_cached jsonb;
  v_result jsonb;
  v_comment text := nullif(trim(p_comment), '');
  v_to public.work_act_status;
  v_approval uuid;
  v_payable public.payables;
  v_uid uuid := (select auth.uid());
begin
  select * into v_doc from public.work_completion_acts where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, p_operation, p_id);
  if v_cached is not null then return v_cached; end if;

  if p_operation = 'submit_work_act' then
    perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'work_acts.create')
                            and v_doc.created_by = v_uid, 'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
    perform private.require(exists (select 1 from public.work_completion_items where work_completion_act_id = p_id),
                            'BF_EMPTY_DOCUMENT');
    v_to := 'REVIEW';
  elsif p_operation in ('approve_work_act', 'reject_work_act') then
    -- Только управляющий закреплённого объекта; бухгалтер не участвует (BP-05).
    perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'work_acts.approve'),
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'REVIEW', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
    perform private.require(v_doc.created_by is distinct from v_uid, 'BF_SELF_APPROVAL');   -- Д-14
    if p_operation = 'reject_work_act' then
      v_comment := private.require_comment(p_comment);
      v_to := 'REJECTED';
    else
      v_to := 'APPROVED';
    end if;
  elsif p_operation = 'cancel_work_act' then
    v_comment := private.require_comment(p_comment);
    if v_doc.status = 'APPROVED' then
      -- Д-72, П-28: утверждённый отменяет управляющий и только без оплат.
      perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'work_acts.approve'),
                              'BF_FORBIDDEN', '42501');
      select * into v_payable from public.payables
      where source_doc_type = 'WORK_ACT' and source_doc_id = p_id for update;
      perform private.require(coalesce(v_payable.paid_amount, 0) = 0, 'BF_HAS_PAYMENTS');
    else
      perform private.require(v_doc.status in ('DRAFT', 'REVIEW'), 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
      perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'work_acts.create')
                              and v_doc.created_by = v_uid, 'BF_FORBIDDEN', '42501');
    end if;
    v_to := 'CANCELLED';
  else
    raise exception using errcode = 'P0001', message = 'BF_INVALID_OPERATION';
  end if;

  perform private.begin_posting();
  update public.work_completion_acts
     set status = v_to,
         number = case when v_to = 'REVIEW' and number is null
                       then private.next_document_number(organization_id, 'WORK_ACT', doc_date) else number end,
         posted_at = case when v_to = 'REVIEW' then now() else posted_at end,
         posted_by = case when v_to = 'REVIEW' then v_uid else posted_by end,
         approved_at = case when v_to = 'APPROVED' then now() else approved_at end,
         approved_by = case when v_to = 'APPROVED' then v_uid else approved_by end,
         rejected_at = case when v_to = 'REJECTED' then now() else rejected_at end,
         rejected_by = case when v_to = 'REJECTED' then v_uid else rejected_by end,
         reject_reason = case when v_to = 'REJECTED' then v_comment else reject_reason end,
         cancelled_at = case when v_to = 'CANCELLED' then now() else cancelled_at end,
         cancelled_by = case when v_to = 'CANCELLED' then v_uid else cancelled_by end,
         cancel_reason = case when v_to = 'CANCELLED' then v_comment else cancel_reason end,
         status_comment = coalesce(v_comment, status_comment)
   where id = p_id
  returning * into v_doc;
  v_result := jsonb_build_object('id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status,
                                 'total', v_doc.total_amount, 'currency', v_doc.currency);

  -- Обязательство перед бригадой — общая модель (Д-63); отменённый акт гасит его.
  if v_to = 'APPROVED' then
    insert into public.payables (organization_id, project_id, counterparty_kind, crew_id, source_doc_type,
      source_doc_id, amount, currency, basis)
    values (v_doc.organization_id, v_doc.project_id, 'CREW', v_doc.crew_id, 'WORK_ACT', v_doc.id,
      v_doc.total_amount, v_doc.currency, 'Акт ' || v_doc.number);
  elsif v_to = 'CANCELLED' and v_payable.id is not null then
    update public.payables set status = 'CANCELLED' where id = v_payable.id;
  end if;

  -- История согласования.
  if v_to = 'REVIEW' then
    insert into public.approval_requests (organization_id, project_id, doc_type, doc_id, required_permission)
    values (v_doc.organization_id, v_doc.project_id, 'WORK_ACT', p_id, 'work_acts.approve') returning id into v_approval;
    insert into public.approval_actions (organization_id, approval_request_id, action, comment)
    values (v_doc.organization_id, v_approval, 'SUBMIT', v_doc.note);
  else
    select id into v_approval from public.approval_requests
    where doc_type = 'WORK_ACT' and doc_id = p_id and status = 'PENDING' for update;
    if v_approval is not null then
      update public.approval_requests
         set status = case v_to when 'APPROVED' then 'APPROVED'::public.approval_status
                                when 'REJECTED' then 'REJECTED' else 'CANCELLED' end,
             decided_at = now(), decided_by = v_uid
       where id = v_approval;
      insert into public.approval_actions (organization_id, approval_request_id, action, comment)
      values (v_doc.organization_id, v_approval,
              case v_to when 'APPROVED' then 'APPROVE'::public.approval_action
                        when 'REJECTED' then 'REJECT' else 'CANCEL' end, v_comment);
    end if;
  end if;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.submit_work_act(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.work_act_transition(p_id, p_key, 'submit_work_act')
$$;
create function public.approve_work_act(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.work_act_transition(p_id, p_key, 'approve_work_act')
$$;
create function public.reject_work_act(p_id uuid, p_key uuid, p_comment text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.work_act_transition(p_id, p_key, 'reject_work_act', p_comment)
$$;
create function public.cancel_work_act(p_id uuid, p_key uuid, p_reason text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.work_act_transition(p_id, p_key, 'cancel_work_act', p_reason)
$$;

-- «Создать на основе»: новый черновик из отклонённого или отменённого акта; тарифы — на сегодня.
-- p_new_id генерирует клиент: повтор возвращает тот же черновик.
create function public.copy_work_act(p_source uuid, p_new_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.work_completion_acts;
  v_doc public.work_completion_acts;
begin
  select * into v_src from public.work_completion_acts where id = p_source;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_src.organization_id, v_src.project_id, 'work_acts.create'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_src.status in ('REJECTED', 'CANCELLED'), 'BF_INVALID_STATUS', 'P0001',
                          v_src.status::text);
  if exists (select 1 from public.work_completion_acts where id = p_new_id) then
    return p_new_id;
  end if;
  insert into public.work_completion_acts (id, organization_id, project_id, crew_id, period_from, period_to,
    replaces_act_id, note)
  values (p_new_id, v_src.organization_id, v_src.project_id, v_src.crew_id, v_src.period_from, v_src.period_to,
    p_source, v_src.note)
  returning * into v_doc;
  perform private.fill_work_act_lines(v_doc, (
    select jsonb_agg(jsonb_build_object('work_type', i.work_type, 'block_id', i.block_id, 'floor_id', i.floor_id,
                                        'quantity', i.quantity, 'note', i.note) order by i.line_no)
    from public.work_completion_items i where i.work_completion_act_id = p_source));
  return p_new_id;
end $$;

-- Д-73: предупреждение (не запрет) о возможном дубле — та же бригада, объект, вид работ,
-- блок и этаж в другом действующем акте за пересекающийся период.
create function public.work_act_duplicates(p_id uuid)
returns table (act_id uuid, number text, status public.work_act_status, doc_date date, work_type text,
               block_name text, floor_name text, quantity numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_doc public.work_completion_acts;
begin
  select * into v_doc from public.work_completion_acts where id = p_id;
  perform private.require(found and private.can(v_doc.organization_id, v_doc.project_id, 'work_acts.view'),
                          'BF_FORBIDDEN', '42501');
  return query
    select o.id, o.number, o.status, o.doc_date, oi.work_type, b.name, f.name, oi.quantity
    from public.work_completion_items mi
    join public.work_completion_items oi on oi.project_id = v_doc.project_id and oi.work_type = mi.work_type
      and oi.block_id is not distinct from mi.block_id and oi.floor_id is not distinct from mi.floor_id
    join public.work_completion_acts o on o.id = oi.work_completion_act_id
    left join public.blocks b on b.id = oi.block_id
    left join public.floors f on f.id = oi.floor_id
    where mi.work_completion_act_id = p_id and o.id <> p_id and o.crew_id = v_doc.crew_id
      and o.status in ('DRAFT', 'REVIEW', 'APPROVED')
      and coalesce(o.period_from, o.doc_date) <= coalesce(v_doc.period_to, v_doc.doc_date)
      and coalesce(v_doc.period_from, v_doc.doc_date) <= coalesce(o.period_to, o.doc_date)
    order by o.doc_date desc;
end $$;

-- -------------------------------------------------------------------------------------
-- 11. Гранты функций
-- -------------------------------------------------------------------------------------
revoke all on function private.current_work_rate(uuid, uuid, text, date), private.recalc_work_act_total(),
  private.guard_work_act(), private.guard_work_rate(),
  private.fill_work_act_lines(public.work_completion_acts, jsonb),
  private.work_act_transition(uuid, uuid, text, text)
  from public, anon, authenticated;

revoke all on function
  public.save_work_rate(uuid, uuid, uuid, text, uuid, numeric, text, date, text),
  public.save_work_act_draft(uuid, uuid, uuid, date, date, date, text, jsonb),
  public.delete_work_act_draft(uuid),
  public.submit_work_act(uuid, uuid), public.approve_work_act(uuid, uuid),
  public.reject_work_act(uuid, uuid, text), public.cancel_work_act(uuid, uuid, text),
  public.copy_work_act(uuid, uuid), public.work_act_duplicates(uuid)
  from public, anon;
grant execute on function
  public.save_work_rate(uuid, uuid, uuid, text, uuid, numeric, text, date, text),
  public.save_work_act_draft(uuid, uuid, uuid, date, date, date, text, jsonb),
  public.delete_work_act_draft(uuid),
  public.submit_work_act(uuid, uuid), public.approve_work_act(uuid, uuid),
  public.reject_work_act(uuid, uuid, text), public.cancel_work_act(uuid, uuid, text),
  public.copy_work_act(uuid, uuid), public.work_act_duplicates(uuid)
  to authenticated;

-- ROLLBACK:
--   drop function (все функции этого файла); вернуть private.allowed_transition и
--   private.permission_catalog из 20261016000000_cash_reversal_approval.sql / 20261015000100_finance.sql;
--   drop table public.work_completion_items, public.work_completion_acts, public.work_rates,
--     public.crew_members cascade;
--   drop type public.work_act_status, public.task_status;
--   вернуть кассиру work_acts.view.
