-- =====================================================================================
-- 0022 Д-100 (пилот 21.10.2026, решения владельца): склад ведётся как их Google Таблица —
-- «Приход», «Расход» (блок, этаж, этап работ, ответственный бригадир, норматив и его остаток),
-- «Услуги» (кран, питание … по блокам и этапам), «Нормативы» (материал + блок + этап, задаёт
-- управляющий), «Отчёт» за период. Строки вводятся таблицей; ошибку правят в ячейке — система
-- делает корректировку/сторно и новую проводку (история и audit_logs сохраняются).
-- Новые наименования (материалы, услуги) добавляются в справочник при сохранении строки.
-- Поставщик в приходе необязателен; блок и этаж в расходе — тоже (питание, хозрасходы).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Справочники: этапы работ и услуги
-- -------------------------------------------------------------------------------------
create table public.work_stages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name            text not null check (length(trim(name)) > 0),
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);
create index on public.work_stages (organization_id, sort_order);

create table public.services (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name            text not null check (length(trim(name)) > 0),
  unit_id         uuid not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (unit_id, organization_id) references public.units_of_measure (id, organization_id),
  unique (id, organization_id)
);
create unique index services_name_key on public.services (organization_id, lower(trim(name)));
create index on public.services (organization_id);

-- Материал с тем же названием (без учёта регистра и пробелов) — один: новые наименования из
-- «Прихода» не должны плодить дубли. Существующие дубли (если есть) не трогаем — индекс частичный
-- не делаем; при сохранении строки поиск идёт по lower(trim(name)).
create index on public.materials (organization_id, lower(trim(name)));

do $$
declare
  t text;
begin
  foreach t in array array['work_stages', 'services'] loop
    execute format('create trigger set_created_by before insert on public.%I
                    for each row execute function private.set_created_by()', t);
    execute format('create trigger before_update_std before update on public.%I
                    for each row execute function private.before_update_std()', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (private.is_member(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated
                    with check (private.has_permission(organization_id, ''catalog.manage''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated
                    using (private.has_permission(organization_id, ''catalog.manage''))
                    with check (private.has_permission(organization_id, ''catalog.manage''))', t || '_update', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
grant update (name, sort_order, is_active) on public.work_stages to authenticated;
grant update (name, unit_id, is_active) on public.services to authenticated;

-- Стартовые этапы (их таблица): существующим организациям и каждой новой.
create function private.seed_work_stages(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.work_stages (organization_id, name, sort_order)
  values (p_org, 'Кладка', 10), (p_org, 'Монолитные работы', 20), (p_org, 'Штукатурные работы', 30),
         (p_org, 'Электрические работы', 40), (p_org, 'Уборка', 50), (p_org, 'Фасовка', 60)
  on conflict (organization_id, name) do nothing
$$;
select private.seed_work_stages(id) from public.organizations;

create or replace function private.on_organization_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_expense_categories(new.id);
  perform private.seed_work_stages(new.id);
  return null;
end $$;
revoke all on function private.seed_work_stages(uuid) from public, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 2. Склад: этап у выдачи, блок/этаж необязательны, поставщик в приходе необязателен
-- -------------------------------------------------------------------------------------
alter table public.material_issues
  add column stage_id uuid,
  add column replaces_issue_id uuid references public.material_issues (id),
  add foreign key (stage_id, organization_id) references public.work_stages (id, organization_id),
  alter column block_id drop not null,
  alter column floor_id drop not null;
create index on public.material_issues (stage_id);
create index on public.material_issues (replaces_issue_id);
alter table public.goods_receipts alter column supplier_id drop not null;

-- -------------------------------------------------------------------------------------
-- 3. Нормативы: материал + блок + этап (Д-100), задаёт управляющий (norms.manage)
-- -------------------------------------------------------------------------------------
create table public.material_norms (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  material_id     uuid not null,
  block_id        uuid not null,
  stage_id        uuid not null,
  quantity        numeric(18, 4) not null check (quantity >= 0),
  note            text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (material_id, organization_id) references public.materials (id, organization_id),
  foreign key (block_id, project_id) references public.blocks (id, project_id),
  foreign key (stage_id, organization_id) references public.work_stages (id, organization_id),
  unique (project_id, material_id, block_id, stage_id)
);
create index on public.material_norms (organization_id);
create index on public.material_norms (project_id);
create trigger set_created_by before insert on public.material_norms
  for each row execute function private.set_created_by();
create trigger before_update_std before update on public.material_norms
  for each row execute function private.before_update_std();
create trigger audit after insert or update or delete on public.material_norms
  for each row execute function private.audit_row();
alter table public.material_norms enable row level security;
create policy material_norms_select on public.material_norms for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view')
         or private.can(organization_id, project_id, 'norms.manage'));
revoke all on public.material_norms from anon, authenticated;
grant select on public.material_norms to authenticated;
grant select, insert, update, delete on public.material_norms to service_role;

-- -------------------------------------------------------------------------------------
-- 4. Услуги: журнал использования (кран, экскаватор, питание …) — без денег и остатков
-- -------------------------------------------------------------------------------------
create table public.service_usages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  doc_date        date not null,
  service_id      uuid not null,
  quantity        numeric(18, 4) not null check (quantity > 0),
  block_id        uuid,
  floor_id        uuid,
  stage_id        uuid,
  crew_id         uuid,
  status          text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),
  note            text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (service_id, organization_id) references public.services (id, organization_id),
  foreign key (block_id, project_id) references public.blocks (id, project_id),
  foreign key (floor_id, block_id) references public.floors (id, block_id),
  foreign key (stage_id, organization_id) references public.work_stages (id, organization_id),
  foreign key (crew_id, organization_id) references public.crews (id, organization_id)
);
create index on public.service_usages (organization_id);
create index on public.service_usages (project_id, doc_date);
create index on public.service_usages (service_id);
create trigger set_created_by before insert on public.service_usages
  for each row execute function private.set_created_by();
create trigger before_update_std before update on public.service_usages
  for each row execute function private.before_update_std();
create trigger audit after insert or update or delete on public.service_usages
  for each row execute function private.audit_row();
alter table public.service_usages enable row level security;
create policy service_usages_select on public.service_usages for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view') or private.is_own_crew(organization_id, crew_id));
revoke all on public.service_usages from anon, authenticated;
grant select on public.service_usages to authenticated;
grant select, insert, update, delete on public.service_usages to service_role;

-- -------------------------------------------------------------------------------------
-- 5. Права: norms.manage — управляющему
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
    -- Д-100: нормативы расхода материалов (план объекта) задаёт управляющий.
    ('project_manager', 'norms.manage'),
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
-- 6. Хелперы строк
-- -------------------------------------------------------------------------------------
-- Материал по id или по названию; нового нет — создаётся (Д-100: «добавлять в справочник самим»).
create function private.resolve_material(p_org uuid, p_material_id uuid, p_name text, p_unit_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_name text := nullif(trim(p_name), '');
begin
  if p_material_id is not null then
    select id into v_id from public.materials where id = p_material_id and organization_id = p_org;
    perform private.require(v_id is not null, 'BF_NOT_FOUND', 'P0002');
    return v_id;
  end if;
  perform private.require(v_name is not null, 'BF_NO_DESCRIPTION');
  select id into v_id from public.materials
   where organization_id = p_org and lower(trim(name)) = lower(v_name)
   order by is_active desc, created_at limit 1;
  if v_id is not null then return v_id; end if;
  perform private.require(p_unit_id is not null, 'BF_REQUIRED_FIELDS');
  insert into public.materials (organization_id, name, unit_id) values (p_org, v_name, p_unit_id)
  returning id into v_id;
  return v_id;
end $$;

-- Окно исправления строки склада: 7 дней — сам склад, старше — бухгалтер (корректировки согласует он).
-- TODO(TZ-open): срок исправления и кто правит старые строки — уточнить у владельца.
create function private.can_fix_stock_row(p_org uuid, p_project uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_date >= private.today() - 7
      or private.can(p_org, p_project, 'goods_receipts.approve_correction')
$$;

-- -------------------------------------------------------------------------------------
-- 7. Строка «Прихода»: приёмка без заявки из одной строки, сразу проведена
-- -------------------------------------------------------------------------------------
create function public.save_receipt_row(
  p_id uuid, p_key uuid, p_project_id uuid, p_doc_date date, p_material_id uuid, p_material_name text,
  p_unit_id uuid, p_quantity numeric, p_supplier_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_doc public.goods_receipts;
  v_cached jsonb;
  v_result jsonb;
  v_material uuid;
  v_new uuid := p_id;
begin
  perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_org, p_project_id, 'goods_receipts.post'), 'BF_FORBIDDEN', '42501');
  v_cached := private.idempotency_begin(v_org, p_key, 'save_receipt_row', p_id);
  if v_cached is not null then return v_cached; end if;
  perform private.require(p_doc_date is not null and coalesce(p_quantity, 0) > 0, 'BF_REQUIRED_FIELDS');
  v_material := private.resolve_material(v_org, p_material_id, p_material_name, p_unit_id);

  select * into v_doc from public.goods_receipts where id = p_id for update;
  if found then
    -- Исправление в ячейке = корректировка приёмки (Д-06, Д-52): исходная — CORRECTED.
    perform private.require(v_doc.organization_id = v_org and v_doc.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'POSTED', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
    perform private.require(private.can_fix_stock_row(v_org, p_project_id, v_doc.doc_date), 'BF_ROW_TOO_OLD');
    perform private.require(not private.receipt_needs_approval(v_doc), 'BF_CORRECTION_NEEDS_APPROVAL');
    v_new := gen_random_uuid();
    insert into public.goods_receipts (id, organization_id, project_id, supplier_id, purchase_request_id,
      supplier_invoice_id, corrects_receipt_id, correction_reason, note, doc_date)
    values (v_new, v_org, p_project_id, p_supplier_id, v_doc.purchase_request_id, v_doc.supplier_invoice_id,
      p_id, 'Исправление строки', v_doc.note, p_doc_date);
    insert into public.goods_receipt_items (organization_id, project_id, goods_receipt_id, line_no, material_id,
      unit_id, purchase_request_item_id, ordered_quantity, received_quantity)
    select v_org, p_project_id, v_new, 1, v_material, gen_random_uuid(), i.purchase_request_item_id,
           i.ordered_quantity, p_quantity
    from (select 1) one
    left join lateral (select purchase_request_item_id, ordered_quantity from public.goods_receipt_items
                       where goods_receipt_id = p_id order by line_no limit 1) i on true;
  else
    insert into public.goods_receipts (id, organization_id, project_id, supplier_id, doc_date)
    values (p_id, v_org, p_project_id, p_supplier_id, p_doc_date);
    insert into public.goods_receipt_items (organization_id, project_id, goods_receipt_id, line_no, material_id,
      unit_id, received_quantity)
    values (v_org, p_project_id, p_id, 1, v_material, gen_random_uuid(), p_quantity);
  end if;

  select * into v_doc from public.goods_receipts where id = v_new;
  perform private.begin_posting();
  v_result := private.apply_goods_receipt(v_doc) || jsonb_build_object('material_id', v_material);
  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

-- -------------------------------------------------------------------------------------
-- 8. Строка «Расхода»: выдача из одной строки (блок, этаж, этап, бригада), сразу проведена
-- -------------------------------------------------------------------------------------
create function public.save_issue_row(
  p_id uuid, p_key uuid, p_project_id uuid, p_doc_date date, p_material_id uuid, p_quantity numeric,
  p_block_id uuid, p_floor_id uuid, p_stage_id uuid, p_crew_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_doc public.material_issues;
  v_cached jsonb;
  v_result jsonb;
  v_new uuid := p_id;
begin
  perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_org, p_project_id, 'material_issues.post'), 'BF_FORBIDDEN', '42501');
  v_cached := private.idempotency_begin(v_org, p_key, 'save_issue_row', p_id);
  if v_cached is not null then return v_cached; end if;
  perform private.require(p_doc_date is not null and p_material_id is not null and p_crew_id is not null
                          and coalesce(p_quantity, 0) > 0, 'BF_REQUIRED_FIELDS');
  perform private.require(p_floor_id is null or p_block_id is not null, 'BF_REQUIRED_FIELDS');

  select * into v_doc from public.material_issues where id = p_id for update;
  if found then
    -- Исправление в ячейке = сторно исходной выдачи + новая (история: replaces_issue_id).
    perform private.require(v_doc.organization_id = v_org and v_doc.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'POSTED', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
    perform private.require(private.can_fix_stock_row(v_org, p_project_id, v_doc.doc_date), 'BF_ROW_TOO_OLD');
    perform public.reverse_material_issue(p_id, gen_random_uuid(), 'Исправление строки');
    v_new := gen_random_uuid();
  end if;

  insert into public.material_issues (id, organization_id, project_id, doc_date, block_id, floor_id, stage_id,
    crew_id, replaces_issue_id)
  values (v_new, v_org, p_project_id, p_doc_date, p_block_id, p_floor_id, p_stage_id, p_crew_id,
    case when v_new <> p_id then p_id end);
  insert into public.material_issue_items (organization_id, project_id, material_issue_id, line_no, material_id,
    unit_id, quantity)
  values (v_org, p_project_id, v_new, 1, p_material_id, gen_random_uuid(), p_quantity);
  v_result := public.post_material_issue(v_new, gen_random_uuid());

  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

-- -------------------------------------------------------------------------------------
-- 9. Строка «Услуг» и норматив
-- -------------------------------------------------------------------------------------
create function public.save_service_row(
  p_id uuid, p_key uuid, p_project_id uuid, p_doc_date date, p_service_id uuid, p_service_name text,
  p_unit_id uuid, p_quantity numeric, p_block_id uuid, p_floor_id uuid, p_stage_id uuid, p_crew_id uuid
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
  perform private.require(private.can(v_org, p_project_id, 'material_issues.post'), 'BF_FORBIDDEN', '42501');
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

  select * into v_row from public.service_usages where id = p_id for update;
  if found then
    perform private.require(v_row.organization_id = v_org and v_row.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_row.status = 'ACTIVE', 'BF_INVALID_STATUS', 'P0001', v_row.status);
    perform private.require(private.can_fix_stock_row(v_org, p_project_id, v_row.doc_date), 'BF_ROW_TOO_OLD');
    update public.service_usages
       set doc_date = p_doc_date, service_id = v_service, quantity = p_quantity, block_id = p_block_id,
           floor_id = p_floor_id, stage_id = p_stage_id, crew_id = p_crew_id
     where id = p_id;
  else
    insert into public.service_usages (id, organization_id, project_id, doc_date, service_id, quantity, block_id,
      floor_id, stage_id, crew_id)
    values (p_id, v_org, p_project_id, p_doc_date, v_service, p_quantity, p_block_id, p_floor_id, p_stage_id,
      p_crew_id);
  end if;
  v_result := jsonb_build_object('id', p_id, 'service_id', v_service);
  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

create function public.cancel_service_row(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.service_usages;
begin
  select * into v_row from public.service_usages where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_row.organization_id, v_row.project_id, 'material_issues.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(private.can_fix_stock_row(v_row.organization_id, v_row.project_id, v_row.doc_date),
                          'BF_ROW_TOO_OLD');
  update public.service_usages set status = 'CANCELLED' where id = p_id;
end $$;

-- Норматив (Д-100): материал + блок + этап; 0 или пусто — удалить. Только управляющий.
create function public.save_material_norm(
  p_project_id uuid, p_material_id uuid, p_block_id uuid, p_stage_id uuid, p_quantity numeric, p_note text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
begin
  perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_org, p_project_id, 'norms.manage'), 'BF_FORBIDDEN', '42501');
  perform private.require(p_material_id is not null and p_block_id is not null and p_stage_id is not null,
                          'BF_REQUIRED_FIELDS');
  if coalesce(p_quantity, 0) <= 0 then
    delete from public.material_norms
     where project_id = p_project_id and material_id = p_material_id and block_id = p_block_id
       and stage_id = p_stage_id;
    return;
  end if;
  insert into public.material_norms (organization_id, project_id, material_id, block_id, stage_id, quantity, note)
  values (v_org, p_project_id, p_material_id, p_block_id, p_stage_id, p_quantity, nullif(trim(p_note), ''))
  on conflict (project_id, material_id, block_id, stage_id)
  do update set quantity = excluded.quantity, note = excluded.note;
end $$;

-- Выдано по выдачам (выдачи − возвраты, со сторно) в разрезе материал + блок + этап — под RLS.
create function public.norm_usage(p_project uuid)
returns table (material_id uuid, block_id uuid, stage_id uuid, norm numeric, issued numeric)
language sql stable security invoker set search_path = '' as $$
  with moves as (
    select m.material_id, i.block_id, i.stage_id, -m.quantity as qty
    from public.stock_movements m
    join public.material_issues i on i.id = m.source_doc_id
    where m.project_id = p_project and m.source_doc_type = 'MATERIAL_ISSUE'
    union all
    select m.material_id, i.block_id, i.stage_id, -m.quantity
    from public.stock_movements m
    join public.material_returns r on r.id = m.source_doc_id
    join public.material_issues i on i.id = r.material_issue_id
    where m.project_id = p_project and m.source_doc_type = 'MATERIAL_RETURN'
  ), issued as (
    select material_id, block_id, stage_id, sum(qty) as issued
    from moves where block_id is not null and stage_id is not null
    group by material_id, block_id, stage_id
  )
  select coalesce(n.material_id, x.material_id), coalesce(n.block_id, x.block_id),
         coalesce(n.stage_id, x.stage_id), n.quantity, coalesce(x.issued, 0)
  from public.material_norms n
  full join issued x on x.material_id = n.material_id and x.block_id = n.block_id and x.stage_id = n.stage_id
  where n.project_id = p_project or n.project_id is null
$$;

-- -------------------------------------------------------------------------------------
-- 10. Отчёт склада за период (их лист «Отчёт») — под RLS пользователя, без цен
-- -------------------------------------------------------------------------------------
create function public.report_warehouse_incoming(p_project uuid, p_from date, p_to date)
returns table (material_id uuid, material text, unit text, quantity numeric, suppliers text)
language sql stable security invoker set search_path = '' as $$
  select m.material_id, mt.name, u.code, sum(m.quantity),
         string_agg(distinct s.name, ', ')
  from public.stock_movements m
  join public.materials mt on mt.id = m.material_id
  join public.units_of_measure u on u.id = mt.unit_id
  left join public.goods_receipts g on g.id = m.source_doc_id and m.source_doc_type = 'GOODS_RECEIPT'
  left join public.suppliers s on s.id = g.supplier_id
  where m.project_id = p_project and m.movement_type in ('RECEIPT', 'RECEIPT_REVERSAL')
    and m.occurred_on between p_from and p_to
  group by m.material_id, mt.name, u.code
  having sum(m.quantity) <> 0
  order by mt.name
$$;

create function public.report_warehouse_outgoing(p_project uuid, p_from date, p_to date)
returns table (material_id uuid, material text, unit text, block text, floor text, stage text,
               quantity numeric, norm numeric, norm_issued numeric)
language sql stable security invoker set search_path = '' as $$
  with moves as (
    select m.material_id, i.block_id, i.floor_id, i.stage_id, -m.quantity as qty
    from public.stock_movements m
    join public.material_issues i on i.id = m.source_doc_id
    where m.project_id = p_project and m.source_doc_type = 'MATERIAL_ISSUE' and m.occurred_on between p_from and p_to
    union all
    select m.material_id, i.block_id, i.floor_id, i.stage_id, -m.quantity
    from public.stock_movements m
    join public.material_returns r on r.id = m.source_doc_id
    join public.material_issues i on i.id = r.material_issue_id
    where m.project_id = p_project and m.source_doc_type = 'MATERIAL_RETURN' and m.occurred_on between p_from and p_to
  ), grouped as (
    select material_id, block_id, floor_id, stage_id, sum(qty) as qty
    from moves group by material_id, block_id, floor_id, stage_id having sum(qty) <> 0
  )
  select g.material_id, mt.name, u.code, b.name, f.name, st.name, g.qty, nu.norm, nu.issued
  from grouped g
  join public.materials mt on mt.id = g.material_id
  join public.units_of_measure u on u.id = mt.unit_id
  left join public.blocks b on b.id = g.block_id
  left join public.floors f on f.id = g.floor_id
  left join public.work_stages st on st.id = g.stage_id
  left join public.norm_usage(p_project) nu
    on nu.material_id = g.material_id and nu.block_id = g.block_id and nu.stage_id = g.stage_id
  order by mt.name, b.name nulls first, f.name nulls first, st.name nulls first
$$;

create function public.report_warehouse_balance(p_project uuid, p_to date)
returns table (material_id uuid, material text, unit text, incoming numeric, outgoing numeric, balance numeric)
language sql stable security invoker set search_path = '' as $$
  select m.material_id, mt.name, u.code,
         -- Приход — приёмки (со сторно корректировок) и ввод остатков; расход — выдачи минус возвраты.
         coalesce(sum(m.quantity) filter (where m.movement_type in
           ('RECEIPT', 'RECEIPT_REVERSAL', 'OPENING', 'ADJUSTMENT')), 0),
         coalesce(-sum(m.quantity) filter (where m.movement_type in
           ('ISSUE', 'ISSUE_REVERSAL', 'RETURN', 'RETURN_REVERSAL')), 0),
         sum(m.quantity)
  from public.stock_movements m
  join public.materials mt on mt.id = m.material_id
  join public.units_of_measure u on u.id = mt.unit_id
  where m.project_id = p_project and m.occurred_on <= p_to
  group by m.material_id, mt.name, u.code
  order by mt.name
$$;

-- -------------------------------------------------------------------------------------
-- 11. Гранты функций
-- -------------------------------------------------------------------------------------
revoke all on function private.resolve_material(uuid, uuid, text, uuid), private.can_fix_stock_row(uuid, uuid, date)
  from public, anon, authenticated;
revoke all on function
  public.save_receipt_row(uuid, uuid, uuid, date, uuid, text, uuid, numeric, uuid),
  public.save_issue_row(uuid, uuid, uuid, date, uuid, numeric, uuid, uuid, uuid, uuid),
  public.save_service_row(uuid, uuid, uuid, date, uuid, text, uuid, numeric, uuid, uuid, uuid, uuid),
  public.cancel_service_row(uuid),
  public.save_material_norm(uuid, uuid, uuid, uuid, numeric, text),
  public.norm_usage(uuid),
  public.report_warehouse_incoming(uuid, date, date),
  public.report_warehouse_outgoing(uuid, date, date),
  public.report_warehouse_balance(uuid, date)
  from public, anon;
grant execute on function
  public.save_receipt_row(uuid, uuid, uuid, date, uuid, text, uuid, numeric, uuid),
  public.save_issue_row(uuid, uuid, uuid, date, uuid, numeric, uuid, uuid, uuid, uuid),
  public.save_service_row(uuid, uuid, uuid, date, uuid, text, uuid, numeric, uuid, uuid, uuid, uuid),
  public.cancel_service_row(uuid),
  public.save_material_norm(uuid, uuid, uuid, uuid, numeric, text),
  public.norm_usage(uuid),
  public.report_warehouse_incoming(uuid, date, date),
  public.report_warehouse_outgoing(uuid, date, date),
  public.report_warehouse_balance(uuid, date)
  to authenticated;

-- ROLLBACK: drop функций этого файла; drop table service_usages, material_norms, services, work_stages;
--   вернуть private.permission_catalog из 20261021000000; private.on_organization_created из 20261023000000;
--   alter table material_issues drop column stage_id, replaces_issue_id (деструктивно — только после «да»);
--   вернуть NOT NULL block_id/floor_id/supplier_id, если нет строк без них.
