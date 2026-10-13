-- =====================================================================================
-- 0004 Инфраструктура проведения (фаза 2): идемпотентность, защита статусов и строк,
-- движения и остатки склада, бригады (минимум), обязательства, согласования, вложения.
-- Модель — ARCHITECTURE §2.3, §2.6–2.8, §6; решения Д-19, Д-21, Д-55…Д-58.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Типы
-- -------------------------------------------------------------------------------------
create type public.stock_movement_type as enum (
  'RECEIPT', 'RECEIPT_REVERSAL', 'ISSUE', 'ISSUE_REVERSAL', 'RETURN', 'RETURN_REVERSAL',
  'OPENING', 'ADJUSTMENT'   -- OPENING — «Ввод остатков» (Д-61); ADJUSTMENT зарезервирован: TODO(TZ-open) инвентаризация
);
create type public.payable_counterparty as enum ('SUPPLIER', 'CREW');
create type public.payable_status as enum ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
create type public.approval_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
create type public.approval_action as enum ('SUBMIT', 'APPROVE', 'REJECT', 'RETURN', 'CANCEL', 'COMMENT');

-- Бизнес-дата документа — по Душанбе (organizations.timezone; в MVP одна зона).
create function private.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Dushanbe')::date
$$;

-- -------------------------------------------------------------------------------------
-- 2. Идемпотентность (§6.2, Д-55). Ключ генерирует клиент; повтор с тем же ключом
--    возвращает сохранённый ответ без повторного эффекта.
-- -------------------------------------------------------------------------------------
create table public.idempotency_keys (
  organization_id uuid not null references public.organizations (id),
  key             uuid not null,
  user_id         uuid,
  operation       text not null,
  target_id       uuid,
  response        jsonb,
  created_at      timestamptz not null default now(),
  primary key (organization_id, key)
);
alter table public.idempotency_keys enable row level security;   -- политик нет: только функции

-- null → первый вызов (продолжаем); jsonb → повтор, вернуть сохранённый ответ.
-- Параллельный дубль с тем же ключом ждёт на PK до коммита первого и получает его ответ.
create function private.idempotency_begin(p_org uuid, p_key uuid, p_operation text, p_target uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.idempotency_keys;
begin
  if p_key is null then
    raise exception using errcode = 'P0001', message = 'BF_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  insert into public.idempotency_keys (organization_id, key, user_id, operation, target_id)
  values (p_org, p_key, (select auth.uid()), p_operation, p_target)
  on conflict do nothing;
  if found then
    return null;
  end if;

  select * into v_row from public.idempotency_keys where organization_id = p_org and key = p_key;
  if v_row.operation <> p_operation or v_row.target_id is distinct from p_target
     or v_row.user_id is distinct from (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'BF_IDEMPOTENCY_KEY_REUSED';
  end if;
  return coalesce(v_row.response, '{}'::jsonb);
end $$;

create function private.idempotency_finish(p_org uuid, p_key uuid, p_response jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.idempotency_keys set response = p_response where organization_id = p_org and key = p_key
$$;

-- -------------------------------------------------------------------------------------
-- 3. Защита документов: статус, номер и проведение меняются только функциями (флаг
--    транзакции bf.in_posting) и только по разрешённым переходам (§4).
-- -------------------------------------------------------------------------------------
create function private.begin_posting() returns void
language sql set search_path = '' as $$
  select set_config('bf.in_posting', 'on', true)
$$;

create function private.in_posting() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('bf.in_posting', true), '') = 'on'
$$;

create function private.allowed_transition(p_table text, p_from text, p_to text) returns boolean
language sql immutable set search_path = '' as $$
  select (p_table, p_from, p_to) in (
    -- Заявка (§4.1). Обратные переходы ISSUED/PARTIALLY_RECEIVED/RECEIVED — пересчёт после корректировки приёмки.
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
    -- Накладная (§4.2)
    ('supplier_invoices', 'ENTERED', 'UNDER_REVIEW'), ('supplier_invoices', 'UNDER_REVIEW', 'ENTERED'),
    ('supplier_invoices', 'UNDER_REVIEW', 'CONFIRMED'), ('supplier_invoices', 'ENTERED', 'CANCELLED'),
    ('supplier_invoices', 'UNDER_REVIEW', 'CANCELLED'), ('supplier_invoices', 'CONFIRMED', 'CANCELLED'),
    -- Приёмка (§4.3, Д-06, Д-52)
    ('goods_receipts', 'DRAFT', 'POSTED'), ('goods_receipts', 'DRAFT', 'CORRECTION_APPROVAL'),
    ('goods_receipts', 'CORRECTION_APPROVAL', 'POSTED'), ('goods_receipts', 'CORRECTION_APPROVAL', 'DRAFT'),
    ('goods_receipts', 'POSTED', 'CORRECTED'),
    -- Выдача и возврат (§4.4)
    ('material_issues', 'DRAFT', 'POSTED'), ('material_issues', 'POSTED', 'REVERSED'),
    ('material_returns', 'DRAFT', 'POSTED'), ('material_returns', 'POSTED', 'REVERSED')
  )
$$;

create function private.guard_document() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  if v_old -> 'status' is distinct from v_new -> 'status'
     or v_old -> 'number' is distinct from v_new -> 'number'
     or v_old -> 'posted_at' is distinct from v_new -> 'posted_at' then
    if not private.in_posting() then
      raise exception using errcode = '42501', message = 'BF_DIRECT_STATUS_CHANGE';
    end if;
    if v_old -> 'status' is distinct from v_new -> 'status'
       and not private.allowed_transition(tg_table_name, v_old ->> 'status', v_new ->> 'status') then
      raise exception using errcode = 'P0001', message = 'BF_INVALID_TRANSITION',
        detail = format('%s: %s → %s', tg_table_name, v_old ->> 'status', v_new ->> 'status');
    end if;
  end if;
  return new;
end $$;

-- Строки документа меняются только пока заголовок в редактируемом статусе.
-- TG_ARGV: 0 — таблица заголовка, 1 — колонка ссылки, 2 — редактируемый статус.
create function private.guard_lines() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row    jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_status text;
begin
  execute format('select status::text from public.%I where id = $1', tg_argv[0])
    into v_status using (v_row ->> tg_argv[1])::uuid;
  -- Заголовок удаляется каскадом вместе со строками — пропускаем.
  if v_status is not null and v_status <> tg_argv[2] then
    raise exception using errcode = 'P0001', message = 'BF_DOCUMENT_LOCKED',
      detail = format('%s в статусе %s', tg_argv[0], v_status);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Единица строки = базовая единица материала (Д-21): значение клиента игнорируется.
create function private.set_line_unit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.material_id is not null then
    select m.unit_id into new.unit_id from public.materials m where m.id = new.material_id;
  end if;
  return new;
end $$;

-- Склад документа = склад объекта (Д-22): значение клиента игнорируется.
create function private.set_doc_warehouse() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select w.id into new.warehouse_id from public.warehouses w where w.project_id = new.project_id;
  if new.warehouse_id is null then
    raise exception using errcode = 'P0001', message = 'BF_NO_WAREHOUSE';
  end if;
  return new;
end $$;

-- -------------------------------------------------------------------------------------
-- 4. Бригады — минимальный справочник (полная модель — фаза 4)
-- -------------------------------------------------------------------------------------
create table public.crews (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id),
  name              text not null check (length(trim(name)) > 0),
  leader_name       text,
  phone             text,
  foreman_member_id uuid,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  foreign key (foreman_member_id, organization_id) references public.organization_members (id, organization_id),
  unique (organization_id, name),
  unique (id, organization_id)
);
create index on public.crews (foreman_member_id);

-- Бригада, где текущий пользователь — ответственный прораб (Д-26: прораб видит выдачи своих бригад).
create function private.is_own_crew(p_org uuid, p_crew uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_org, 'stock.view_own_crews')
     and exists (select 1 from public.crews c
                 where c.id = p_crew and c.foreman_member_id = private.member_id(p_org))
$$;

-- -------------------------------------------------------------------------------------
-- 5. Движения и остатки (§2.3, §6.4). Движения — источник истины, остатки — производная.
-- -------------------------------------------------------------------------------------
create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  warehouse_id    uuid not null,
  material_id     uuid not null,
  unit_id         uuid not null,
  quantity        numeric(18, 4) not null check (quantity <> 0),
  movement_type   public.stock_movement_type not null,
  source_doc_type public.document_type not null,
  source_doc_id   uuid not null,
  source_line_id  uuid,
  reversal_of_id  uuid references public.stock_movements (id),
  occurred_on     date not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  foreign key (warehouse_id, organization_id, project_id)
    references public.warehouses (id, organization_id, project_id),
  foreign key (material_id, organization_id) references public.materials (id, organization_id),
  unique (source_line_id, movement_type),   -- «+21 кг ровно один раз» на уровне БД
  unique (reversal_of_id)                   -- движение сторнируется не более одного раза
);
create index on public.stock_movements (organization_id);
create index on public.stock_movements (project_id);
create index on public.stock_movements (warehouse_id, material_id, occurred_on);
create index on public.stock_movements (source_doc_type, source_doc_id);
create index on public.stock_movements (material_id);

create table public.stock_balances (
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  warehouse_id    uuid not null,
  material_id     uuid not null,
  quantity        numeric(18, 4) not null default 0 check (quantity >= 0),   -- Д-19: последний рубеж
  updated_at      timestamptz not null default now(),
  primary key (warehouse_id, material_id),
  foreign key (warehouse_id, organization_id, project_id)
    references public.warehouses (id, organization_id, project_id),
  foreign key (material_id, organization_id) references public.materials (id, organization_id)
);
create index on public.stock_balances (organization_id);
create index on public.stock_balances (project_id);
create index on public.stock_balances (material_id);

-- Изменение остатка с проверкой на минус (Д-19). Строка остатка блокируется (FOR UPDATE) —
-- параллельные проведения одного материала на складе сериализуются.
create function private.apply_balance_delta(
  p_org uuid, p_project uuid, p_warehouse uuid, p_material uuid, p_delta numeric
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_available numeric(18, 4);
begin
  if p_delta = 0 then return; end if;

  insert into public.stock_balances (organization_id, project_id, warehouse_id, material_id, quantity)
  values (p_org, p_project, p_warehouse, p_material, 0)
  on conflict (warehouse_id, material_id) do nothing;

  select b.quantity into v_available from public.stock_balances b
  where b.warehouse_id = p_warehouse and b.material_id = p_material
  for update;

  -- Д-19: минус запрещён; в ошибке — текущий остаток (без цен).
  if v_available + p_delta < 0 then
    raise exception using errcode = 'P0001', message = 'BF_NEGATIVE_STOCK',
      detail = (select jsonb_build_object('material', m.name, 'unit', u.code,
                                          'available', v_available, 'required', -p_delta)::text
                from public.materials m join public.units_of_measure u on u.id = m.unit_id
                where m.id = p_material);
  end if;

  update public.stock_balances set quantity = v_available + p_delta, updated_at = now()
  where warehouse_id = p_warehouse and material_id = p_material;
end $$;

-- Запись движения без изменения остатка; возвращает id (остатки применяет apply_movements по списку id).
create function private.add_movement(
  p_org uuid, p_project uuid, p_warehouse uuid, p_material uuid, p_quantity numeric,
  p_type public.stock_movement_type, p_doc_type public.document_type, p_doc_id uuid,
  p_line_id uuid, p_occurred_on date, p_reversal_of uuid default null
) returns uuid
language sql security definer set search_path = '' as $$
  insert into public.stock_movements (organization_id, project_id, warehouse_id, material_id, unit_id,
    quantity, movement_type, source_doc_type, source_doc_id, source_line_id, reversal_of_id, occurred_on,
    created_by)
  select p_org, p_project, p_warehouse, p_material, m.unit_id, p_quantity, p_type, p_doc_type, p_doc_id,
    p_line_id, p_reversal_of, p_occurred_on, (select auth.uid())
  from public.materials m where m.id = p_material
  returning id
$$;

-- Сторно (без изменения остатка) всех ещё не сторнированных движений документа (§6.3).
create function private.add_reversal_movements(
  p_doc_type public.document_type, p_doc_id uuid, p_reversal_type public.stock_movement_type
) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_mv public.stock_movements;
  v_ids uuid[] := '{}';
begin
  for v_mv in
    select m.* from public.stock_movements m
    where m.source_doc_type = p_doc_type and m.source_doc_id = p_doc_id and m.reversal_of_id is null
      and not exists (select 1 from public.stock_movements r where r.reversal_of_id = m.id)
    order by m.material_id, m.id
  loop
    v_ids := v_ids || private.add_movement(v_mv.organization_id, v_mv.project_id, v_mv.warehouse_id,
      v_mv.material_id, -v_mv.quantity, p_reversal_type, p_doc_type, p_doc_id, null, private.today(), v_mv.id);
  end loop;
  return v_ids;
end $$;

-- Применить к остаткам перечисленные движения: итоговая дельта по материалу, в порядке material_id
-- (единый порядок блокировок — без дедлоков). Корректировка «−21 и +20» проверяется на минус по итогу.
create function private.apply_movements(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
begin
  for v_row in
    select m.organization_id, m.project_id, m.warehouse_id, m.material_id, sum(m.quantity) as delta
    from public.stock_movements m
    where m.id = any (p_ids)
    group by m.organization_id, m.project_id, m.warehouse_id, m.material_id
    order by m.material_id
  loop
    perform private.apply_balance_delta(v_row.organization_id, v_row.project_id, v_row.warehouse_id,
                                        v_row.material_id, v_row.delta);
  end loop;
end $$;

-- Сверка: остаток = сумма движений (§6.4). Пустой результат — всё сходится.
create function public.check_stock_consistency(p_org uuid)
returns table (warehouse_id uuid, material_id uuid, balance numeric, movements_sum numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission(p_org, 'stock.view') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  return query
    with sums as (
      select m.warehouse_id, m.material_id, sum(m.quantity) as total
      from public.stock_movements m where m.organization_id = p_org
      group by m.warehouse_id, m.material_id
    )
    select coalesce(b.warehouse_id, s.warehouse_id), coalesce(b.material_id, s.material_id),
           coalesce(b.quantity, 0), coalesce(s.total, 0)
    from public.stock_balances b
    full join sums s on s.warehouse_id = b.warehouse_id and s.material_id = b.material_id
    where (b.organization_id = p_org or b.organization_id is null)
      and coalesce(b.quantity, 0) <> coalesce(s.total, 0);
end $$;

-- Полный пересчёт остатков склада из движений (сервис; только service_role).
create function public.recalculate_stock_balances(p_warehouse uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  perform 1 from public.warehouses where id = p_warehouse for update;
  delete from public.stock_balances where warehouse_id = p_warehouse;
  insert into public.stock_balances (organization_id, project_id, warehouse_id, material_id, quantity)
  select m.organization_id, m.project_id, m.warehouse_id, m.material_id, sum(m.quantity)
  from public.stock_movements m where m.warehouse_id = p_warehouse
  group by m.organization_id, m.project_id, m.warehouse_id, m.material_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Д-21: единицу материала с движениями менять нельзя (остатки и история потеряли бы смысл).
create function private.guard_material_unit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.unit_id is distinct from old.unit_id
     and exists (select 1 from public.stock_movements m where m.material_id = old.id) then
    raise exception using errcode = 'P0001', message = 'BF_UNIT_LOCKED';
  end if;
  return new;
end $$;
create trigger guard_material_unit before update of unit_id on public.materials
  for each row execute function private.guard_material_unit();

-- Движения неизменяемы (append-only) — даже для владельца без флага проведения.
create function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'BF_APPEND_ONLY';
end $$;
create trigger append_only before update or delete on public.stock_movements
  for each row execute function private.forbid_change();

-- -------------------------------------------------------------------------------------
-- 6. Обязательства (§2.6). В фазе 2 — только поставщики; оплаты — фаза финансов.
-- -------------------------------------------------------------------------------------
create table public.payables (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id),
  project_id        uuid,
  counterparty_kind public.payable_counterparty not null,
  supplier_id       uuid,
  crew_id           uuid,
  source_doc_type   public.document_type not null,
  source_doc_id     uuid not null,
  amount            numeric(18, 2) not null check (amount > 0),
  currency          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  paid_amount       numeric(18, 2) not null default 0 check (paid_amount >= 0),
  status            public.payable_status not null default 'OPEN',
  due_date          date,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (crew_id, organization_id) references public.crews (id, organization_id),
  check ((counterparty_kind = 'SUPPLIER' and supplier_id is not null and crew_id is null)
      or (counterparty_kind = 'CREW' and crew_id is not null and supplier_id is null)),
  check (paid_amount <= amount),   -- Д-17: переплаты запрещены, TODO(TZ-open) авансы
  unique (source_doc_type, source_doc_id)
);
create index on public.payables (organization_id);
create index on public.payables (project_id);
create index on public.payables (supplier_id);
create index on public.payables (crew_id);
create index on public.payables (status);

-- -------------------------------------------------------------------------------------
-- 7. Согласования (§2.8): корректировки приёмки сейчас; счета и акты — следующие фазы.
-- -------------------------------------------------------------------------------------
create table public.approval_requests (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id),
  project_id          uuid,
  doc_type            public.document_type not null,
  doc_id              uuid not null,
  status              public.approval_status not null default 'PENDING',
  required_permission text not null,
  decided_at          timestamptz,
  decided_by          uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id),
  updated_at          timestamptz not null default now()
);
create unique index approval_requests_pending_key on public.approval_requests (doc_type, doc_id)
  where status = 'PENDING';
create index on public.approval_requests (organization_id);
create index on public.approval_requests (project_id);
create index on public.approval_requests (doc_type, doc_id);

create table public.approval_actions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id),
  approval_request_id uuid not null references public.approval_requests (id),
  action              public.approval_action not null,
  comment             text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id)
);
create index on public.approval_actions (organization_id);
create index on public.approval_actions (approval_request_id);
create trigger append_only before update or delete on public.approval_actions
  for each row execute function private.forbid_change();

-- -------------------------------------------------------------------------------------
-- 8. Вложения (§2.8) и приватное хранилище. Политики доступа — в миграции склада
--    (зависят от таблиц документов).
-- -------------------------------------------------------------------------------------
create table public.document_attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid,
  doc_type        public.document_type not null,
  doc_id          uuid not null,
  storage_path    text not null unique,
  file_name       text not null,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes > 0),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now()
);
create index on public.document_attachments (organization_id);
create index on public.document_attachments (project_id);
create index on public.document_attachments (doc_type, doc_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- -------------------------------------------------------------------------------------
-- 9. Триггеры, RLS, гранты (Д-40)
-- -------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['crews', 'payables', 'approval_requests', 'document_attachments'] loop
    execute format('create trigger set_created_by before insert on public.%I
                    for each row execute function private.set_created_by()', t);
    execute format('create trigger before_update_std before update on public.%I
                    for each row execute function private.before_update_std()', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t);
  end loop;
end $$;
create trigger audit after insert on public.approval_actions
  for each row execute function private.audit_row();

alter table public.crews                enable row level security;
alter table public.stock_movements      enable row level security;
alter table public.stock_balances       enable row level security;
alter table public.payables             enable row level security;
alter table public.approval_requests    enable row level security;
alter table public.approval_actions     enable row level security;
alter table public.document_attachments enable row level security;

create policy crews_select on public.crews for select to authenticated
  using (private.is_member(organization_id));
create policy crews_insert on public.crews for insert to authenticated
  with check (private.has_permission(organization_id, 'crews.manage'));
create policy crews_update on public.crews for update to authenticated
  using (private.has_permission(organization_id, 'crews.manage'))
  with check (private.has_permission(organization_id, 'crews.manage'));

create policy stock_movements_select on public.stock_movements for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view'));
create policy stock_balances_select on public.stock_balances for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view'));

create policy payables_select on public.payables for select to authenticated
  using (private.can(organization_id, project_id, 'payables.view'));

-- Согласования видят участники объекта (данных о ценах в них нет).
create policy approval_requests_select on public.approval_requests for select to authenticated
  using (private.is_member(organization_id)
         and (project_id is null or private.has_project_access(organization_id, project_id)));
create policy approval_actions_select on public.approval_actions for select to authenticated
  using (exists (select 1 from public.approval_requests r where r.id = approval_request_id));

revoke all on public.crews, public.stock_movements, public.stock_balances, public.payables,
  public.approval_requests, public.approval_actions, public.document_attachments,
  public.idempotency_keys from anon, authenticated;
grant select, insert on public.crews to authenticated;
grant update (name, leader_name, phone, foreman_member_id, is_active) on public.crews to authenticated;
grant select on public.stock_movements, public.stock_balances, public.payables,
  public.approval_requests, public.approval_actions, public.document_attachments to authenticated;
grant select, insert, update, delete on public.crews, public.stock_movements, public.stock_balances,
  public.payables, public.approval_requests, public.approval_actions, public.document_attachments,
  public.idempotency_keys to service_role;

revoke all on function private.today(), private.idempotency_begin(uuid, uuid, text, uuid),
  private.idempotency_finish(uuid, uuid, jsonb), private.begin_posting(), private.in_posting(),
  private.allowed_transition(text, text, text), private.is_own_crew(uuid, uuid),
  private.apply_balance_delta(uuid, uuid, uuid, uuid, numeric),
  private.add_movement(uuid, uuid, uuid, uuid, numeric, public.stock_movement_type, public.document_type, uuid, uuid, date, uuid),
  private.add_reversal_movements(public.document_type, uuid, public.stock_movement_type),
  private.apply_movements(uuid[])
  from public, anon, authenticated;
-- is_own_crew используется в RLS-политиках от имени пользователя.
grant execute on function private.is_own_crew(uuid, uuid), private.in_posting() to authenticated;
-- today() — значение по умолчанию doc_date: вычисляется от имени вставляющей роли.
grant execute on function private.today() to authenticated, service_role;
revoke all on function public.check_stock_consistency(uuid), public.recalculate_stock_balances(uuid)
  from public, anon, authenticated;
grant execute on function public.check_stock_consistency(uuid) to authenticated;
grant execute on function public.recalculate_stock_balances(uuid) to service_role;

-- ROLLBACK:
--   drop table public.document_attachments, public.approval_actions, public.approval_requests,
--     public.payables, public.stock_balances, public.stock_movements, public.crews,
--     public.idempotency_keys cascade;
--   delete from storage.buckets where id = 'documents';
--   drop trigger guard_material_unit on public.materials;
--   drop function private.guard_material_unit(), private.forbid_change(), private.apply_balance_delta(...),
--     private.add_movement(...), private.add_reversal_movements(...), private.apply_movements(uuid[]), public.check_stock_consistency(uuid),
--     public.recalculate_stock_balances(uuid), private.is_own_crew(uuid, uuid), private.set_doc_warehouse(),
--     private.set_line_unit(), private.guard_lines(), private.guard_document(),
--     private.allowed_transition(text, text, text), private.in_posting(), private.begin_posting(),
--     private.idempotency_finish(uuid, uuid, jsonb), private.idempotency_begin(uuid, uuid, text, uuid),
--     private.today();
--   drop type public.approval_action, public.approval_status, public.payable_status,
--     public.payable_counterparty, public.stock_movement_type;
