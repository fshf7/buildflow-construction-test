-- Д-111: заявка на услугу — НЕОБЯЗАТЕЛЬНАЯ (основа учёта услуг — факт в журнале service_usages).
-- Для дорогих услуг (кран, экскаватор): склад или прораб (только свои бригады) создаёт заявку →
-- управляющий согласует или отклоняет (с причиной) → услугу заказывают вне системы → склад вносит
-- факт в журнал со ссылкой на заявку («выполнено» = сумма строк) → склад закрывает заявку.
-- Статусы: SUBMITTED → APPROVED | REJECTED | CANCELLED; APPROVED → DONE | CANCELLED.
-- Запись — только функциями (атомарно, идемпотентно); прямых грантов на запись нет.

-- -------------------------------------------------------------------------------------
-- 1. Номер ЗУ-…, права
-- -------------------------------------------------------------------------------------
create or replace function private.document_prefix(p_doc_type public.document_type) returns text
language sql immutable set search_path = '' as $$
  select case p_doc_type::text
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
    when 'OPENING_BALANCE'  then 'ВО'
    when 'SERVICE_REQUEST'  then 'ЗУ'
  end
$$;

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
    ('accountant', 'purchase_requests.view'), ('accountant', 'purchase_requests.review'),
    ('accountant', 'prices.view'), ('accountant', 'supplier_invoices.view'),
    ('accountant', 'supplier_invoices.manage'), ('accountant', 'stock.view'),
    ('accountant', 'goods_receipts.approve_correction'), ('accountant', 'payables.view'),
    ('accountant', 'payment_requests.view'), ('accountant', 'payment_requests.approve'),
    ('accountant', 'cash.view'), ('accountant', 'crews.view'), ('accountant', 'work_acts.view'),
    ('accountant', 'tasks.view'), ('accountant', 'reports.view'), ('accountant', 'audit.view'),
    ('accountant', 'opening_balances.manage'),
    ('accountant', 'cash.reverse_approve'), ('accountant', 'cash.reversals_report'),

    ('warehouse', 'projects.view'), ('warehouse', 'purchase_requests.view'),
    ('warehouse', 'purchase_requests.manage'),
    ('warehouse', 'supplier_invoices.view'), ('warehouse', 'stock.view'),
    ('warehouse', 'goods_receipts.post'), ('warehouse', 'material_issues.post'),
    ('warehouse', 'tasks.execute'),
    -- Д-111: заявка на услугу (необязательная) — склад и прораб, согласует управляющий.
    ('warehouse', 'service_requests.create'),

    ('cashier', 'projects.view'), ('cashier', 'supplier_invoices.view'), ('cashier', 'payables.view'),
    ('cashier', 'payment_requests.view'), ('cashier', 'payment_requests.create'),
    ('cashier', 'cash.view'), ('cashier', 'cash.post'), ('cashier', 'cash.reverse'),
    ('cashier', 'cash_accounts.manage'), ('cashier', 'crews.view'), ('cashier', 'work_acts.view_approved'),
    ('cashier', 'tasks.execute'), ('cashier', 'reports.view'),

    ('foreman', 'projects.view'), ('foreman', 'stock.view_own_crews'), ('foreman', 'crews.view'),
    ('foreman', 'crews.manage'), ('foreman', 'work_acts.view'), ('foreman', 'work_acts.create'),
    ('foreman', 'tasks.execute'), ('foreman', 'service_requests.create'),

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
    -- Д-100: нормативы расхода материалов (план объекта) задаёт управляющий.
    ('project_manager', 'norms.manage'),
    ('project_manager', 'service_requests.approve'),
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

-- -------------------------------------------------------------------------------------
-- 2. Таблица заявок
-- -------------------------------------------------------------------------------------
create table public.service_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id),
  project_id       uuid not null,
  number           text,
  doc_date         date not null default private.today(),
  planned_date     date,
  service_id       uuid not null,
  quantity         numeric(18, 4) not null check (quantity > 0),
  block_id         uuid,
  floor_id         uuid,
  stage_id         uuid,
  crew_id          uuid,
  note             text,
  status           text not null default 'SUBMITTED'
                   check (status in ('SUBMITTED', 'APPROVED', 'REJECTED', 'DONE', 'CANCELLED')),
  decided_by       uuid references auth.users (id),
  decided_at       timestamptz,
  decision_comment text,
  closed_by        uuid references auth.users (id),
  closed_at        timestamptz,
  cancelled_by     uuid references auth.users (id),
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (service_id, organization_id) references public.services (id, organization_id),
  foreign key (block_id, project_id) references public.blocks (id, project_id),
  foreign key (floor_id, block_id) references public.floors (id, block_id),
  foreign key (stage_id, organization_id) references public.work_stages (id, organization_id),
  foreign key (crew_id, organization_id) references public.crews (id, organization_id),
  check (floor_id is null or block_id is not null),
  unique (id, project_id)
);
create unique index service_requests_number_key on public.service_requests (organization_id, number)
  where number is not null;
create index on public.service_requests (organization_id);
create index on public.service_requests (project_id, status);
create index on public.service_requests (service_id);
create index on public.service_requests (crew_id);
create trigger set_created_by before insert on public.service_requests
  for each row execute function private.set_created_by();
create trigger before_update_std before update on public.service_requests
  for each row execute function private.before_update_std();
create trigger audit after insert or update or delete on public.service_requests
  for each row execute function private.audit_row();
alter table public.service_requests enable row level security;
-- Видят: склад/бухгалтер/управляющий объекта (stock.view), прораб — заявки своих бригад, автор.
create policy service_requests_select on public.service_requests for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view')
         or private.is_own_crew(organization_id, crew_id)
         or created_by = (select auth.uid()));
revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
grant select, insert, update, delete on public.service_requests to service_role;

-- Строка журнала (факт) — необязательно по заявке.
alter table public.service_usages add column service_request_id uuid;
alter table public.service_usages add foreign key (service_request_id, project_id)
  references public.service_requests (id, project_id);
create index on public.service_usages (service_request_id);

-- -------------------------------------------------------------------------------------
-- 3. Функции заявки
-- -------------------------------------------------------------------------------------
-- Кто вправе править/отменять: склад объекта (material_issues.post) или автор заявки.
create function private.can_manage_service_request(p_row public.service_requests) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can(p_row.organization_id, p_row.project_id, 'material_issues.post')
      or p_row.created_by = (select auth.uid())
$$;

create function public.save_service_request(
  p_id uuid, p_key uuid, p_project_id uuid, p_service_id uuid, p_quantity numeric, p_planned_date date,
  p_block_id uuid, p_floor_id uuid, p_stage_id uuid, p_crew_id uuid, p_note text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_row public.service_requests;
  v_cached jsonb;
  v_result jsonb;
begin
  perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_org, p_project_id, 'service_requests.create'), 'BF_FORBIDDEN', '42501');
  v_cached := private.idempotency_begin(v_org, p_key, 'save_service_request', p_id);
  if v_cached is not null then return v_cached; end if;
  perform private.require(p_service_id is not null and coalesce(p_quantity, 0) > 0, 'BF_REQUIRED_FIELDS');
  perform private.require(p_floor_id is null or p_block_id is not null, 'BF_REQUIRED_FIELDS');
  perform private.require(exists (select 1 from public.services
                                  where id = p_service_id and organization_id = v_org and is_active),
                          'BF_NOT_FOUND', 'P0002');
  -- Прораб — только для своей бригады; склад — для любой (или без бригады).
  perform private.require(private.can(v_org, p_project_id, 'material_issues.post')
                          or (p_crew_id is not null and private.is_own_crew(v_org, p_crew_id)),
                          'BF_FORBIDDEN', '42501');

  select * into v_row from public.service_requests where id = p_id for update;
  if found then
    perform private.require(v_row.organization_id = v_org and v_row.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(private.can_manage_service_request(v_row), 'BF_FORBIDDEN', '42501');
    perform private.require(v_row.status = 'SUBMITTED', 'BF_INVALID_STATUS', 'P0001', v_row.status);
    update public.service_requests
       set service_id = p_service_id, quantity = p_quantity, planned_date = p_planned_date,
           block_id = p_block_id, floor_id = p_floor_id, stage_id = p_stage_id, crew_id = p_crew_id,
           note = nullif(trim(p_note), '')
     where id = p_id
    returning * into v_row;
  else
    insert into public.service_requests (id, organization_id, project_id, number, service_id, quantity,
      planned_date, block_id, floor_id, stage_id, crew_id, note)
    values (p_id, v_org, p_project_id,
      private.next_document_number(v_org, 'SERVICE_REQUEST', private.today()), p_service_id, p_quantity,
      p_planned_date, p_block_id, p_floor_id, p_stage_id, p_crew_id, nullif(trim(p_note), ''))
    returning * into v_row;
  end if;
  v_result := jsonb_build_object('id', v_row.id, 'number', v_row.number, 'status', v_row.status);
  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

-- Согласование управляющим; отказ — с причиной. Свою заявку не согласовать (как счета, Д-…).
create function public.decide_service_request(p_id uuid, p_key uuid, p_approve boolean, p_comment text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.service_requests;
  v_cached jsonb;
  v_result jsonb;
begin
  select * into v_row from public.service_requests where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_row.organization_id, p_key, 'decide_service_request', p_id);
  if v_cached is not null then return v_cached; end if;
  perform private.require(private.can(v_row.organization_id, v_row.project_id, 'service_requests.approve'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_row.status = 'SUBMITTED', 'BF_INVALID_STATUS', 'P0001', v_row.status);
  perform private.require(v_row.created_by is distinct from (select auth.uid()), 'BF_SELF_APPROVAL');
  update public.service_requests
     set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
         decided_by = (select auth.uid()), decided_at = now(),
         decision_comment = case when p_approve then nullif(trim(p_comment), '')
                                 else private.require_comment(p_comment) end
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;
  perform private.idempotency_finish(v_row.organization_id, p_key, v_result);
  return v_result;
end $$;

-- Отмена (склад или автор): пока нет выполнения; с выполнением — закрыть.
create function public.cancel_service_request(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.service_requests;
begin
  select * into v_row from public.service_requests where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can_manage_service_request(v_row), 'BF_FORBIDDEN', '42501');
  perform private.require(v_row.status in ('SUBMITTED', 'APPROVED'), 'BF_INVALID_STATUS', 'P0001', v_row.status);
  perform private.require(not exists (select 1 from public.service_usages
                                      where service_request_id = p_id and status = 'ACTIVE'),
                          'BF_HAS_USAGES');
  update public.service_requests
     set status = 'CANCELLED', cancelled_by = (select auth.uid()), cancelled_at = now(),
         cancel_reason = private.require_comment(p_reason)
   where id = p_id;
end $$;

-- Закрыть выполненную (склад): больше строк по ней не вносят.
create function public.close_service_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.service_requests;
begin
  select * into v_row from public.service_requests where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_row.organization_id, v_row.project_id, 'material_issues.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_row.status = 'APPROVED', 'BF_INVALID_STATUS', 'P0001', v_row.status);
  update public.service_requests set status = 'DONE', closed_by = (select auth.uid()), closed_at = now()
   where id = p_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 4. Строка журнала услуг — со ссылкой на заявку (новый необязательный параметр)
-- -------------------------------------------------------------------------------------
drop function public.save_service_row(uuid, uuid, uuid, date, uuid, text, uuid, numeric, uuid, uuid, uuid, uuid);

create function public.save_service_row(
  p_id uuid, p_key uuid, p_project_id uuid, p_doc_date date, p_service_id uuid, p_service_name text,
  p_unit_id uuid, p_quantity numeric, p_block_id uuid, p_floor_id uuid, p_stage_id uuid, p_crew_id uuid,
  p_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_row public.service_usages;
  v_cached jsonb;
  v_service uuid;
  v_name text := nullif(trim(p_service_name), '');
  v_result jsonb;
begin
  perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
  -- Новая строка — склад; исправление — склад в пределах 7 дней или бухгалтер (Д-109).
  perform private.require(private.can(v_org, p_project_id, 'material_issues.post')
                          or private.can(v_org, p_project_id, 'goods_receipts.approve_correction'),
                          'BF_FORBIDDEN', '42501');
  v_cached := private.idempotency_begin(v_org, p_key, 'save_service_row', p_id);
  if v_cached is not null then return v_cached; end if;
  perform private.require(p_doc_date is not null and coalesce(p_quantity, 0) > 0, 'BF_REQUIRED_FIELDS');
  perform private.require(p_floor_id is null or p_block_id is not null, 'BF_REQUIRED_FIELDS');

  if p_service_id is not null then
    select id into v_service from public.services where id = p_service_id and organization_id = v_org;
    perform private.require(v_service is not null, 'BF_NOT_FOUND', 'P0002');
  else
    perform private.require(v_name is not null, 'BF_NO_DESCRIPTION');
    select id into v_service from public.services
     where organization_id = v_org and lower(trim(name)) = lower(v_name);
    if v_service is null then
      perform private.require(p_unit_id is not null, 'BF_REQUIRED_FIELDS');
      insert into public.services (organization_id, name, unit_id) values (v_org, v_name, p_unit_id)
      returning id into v_service;
    end if;
  end if;

  -- Д-111: строка может ссылаться на согласованную заявку этого объекта и этой услуги.
  if p_request_id is not null then
    perform private.require(exists (select 1 from public.service_requests r
                                    where r.id = p_request_id and r.project_id = p_project_id
                                      and r.service_id = v_service and r.status = 'APPROVED'),
                            'BF_SERVICE_REQUEST_MISMATCH');
  end if;

  select * into v_row from public.service_usages where id = p_id for update;
  if found then
    perform private.require(v_row.organization_id = v_org and v_row.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_row.status = 'ACTIVE', 'BF_INVALID_STATUS', 'P0001', v_row.status);
    perform private.require(private.can_fix_stock_row(v_org, p_project_id, v_row.doc_date), 'BF_ROW_TOO_OLD');
    update public.service_usages
       set doc_date = p_doc_date, service_id = v_service, quantity = p_quantity, block_id = p_block_id,
           floor_id = p_floor_id, stage_id = p_stage_id, crew_id = p_crew_id,
           service_request_id = p_request_id
     where id = p_id;
  else
    perform private.require(private.can(v_org, p_project_id, 'material_issues.post'), 'BF_FORBIDDEN', '42501');
    insert into public.service_usages (id, organization_id, project_id, doc_date, service_id, quantity, block_id,
      floor_id, stage_id, crew_id, service_request_id)
    values (p_id, v_org, p_project_id, p_doc_date, v_service, p_quantity, p_block_id, p_floor_id, p_stage_id,
      p_crew_id, p_request_id);
  end if;
  v_result := jsonb_build_object('id', p_id, 'service_id', v_service);
  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

revoke all on function private.can_manage_service_request(public.service_requests) from public, anon, authenticated;
revoke all on function
  public.save_service_request(uuid, uuid, uuid, uuid, numeric, date, uuid, uuid, uuid, uuid, text),
  public.decide_service_request(uuid, uuid, boolean, text),
  public.cancel_service_request(uuid, text),
  public.close_service_request(uuid),
  public.save_service_row(uuid, uuid, uuid, date, uuid, text, uuid, numeric, uuid, uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function
  public.save_service_request(uuid, uuid, uuid, uuid, numeric, date, uuid, uuid, uuid, uuid, text),
  public.decide_service_request(uuid, uuid, boolean, text),
  public.cancel_service_request(uuid, text),
  public.close_service_request(uuid),
  public.save_service_row(uuid, uuid, uuid, date, uuid, text, uuid, numeric, uuid, uuid, uuid, uuid, uuid)
  to authenticated;

-- ROLLBACK: drop функций этого файла; save_service_row — версия из 20261104000000;
--   alter table service_usages drop column service_request_id; drop table service_requests;
--   private.permission_catalog / document_prefix — из 20261025000000 / 20261015000100;
--   delete from permissions where code in ('service_requests.create', 'service_requests.approve').
