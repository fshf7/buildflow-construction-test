-- =====================================================================================
-- 0006 Склад (BP-02): приёмки и их корректировки, выдачи бригадам, возвраты, вложения.
-- ARCHITECTURE §2.4–2.5, §4.3–4.4, §6; решения Д-06, Д-19, Д-52, Д-53, Д-55, Д-58.
-- Цен в складских таблицах нет по построению (§5.4).
-- =====================================================================================

create type public.goods_receipt_status as enum ('DRAFT', 'CORRECTION_APPROVAL', 'POSTED', 'CORRECTED');
create type public.issue_status as enum ('DRAFT', 'POSTED', 'REVERSED');

-- -------------------------------------------------------------------------------------
-- 1. Приёмки
-- -------------------------------------------------------------------------------------
create table public.goods_receipts (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id),
  project_id             uuid not null,
  warehouse_id           uuid not null,
  supplier_id            uuid not null,
  purchase_request_id    uuid,
  supplier_invoice_id    uuid,                         -- связь с накладной (бухгалтер, позже)
  number                 text,
  doc_date               date not null default private.today(),
  status                 public.goods_receipt_status not null default 'DRAFT',
  received_at            timestamptz not null default now(),
  corrects_receipt_id    uuid unique references public.goods_receipts (id),   -- Д-06
  correction_reason      text,
  correction_approved_at timestamptz,
  correction_approved_by uuid references auth.users (id),
  note                   text,
  posted_at              timestamptz,
  posted_by              uuid references auth.users (id),
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id),
  updated_at             timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (warehouse_id, organization_id, project_id)
    references public.warehouses (id, organization_id, project_id),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (purchase_request_id, organization_id, project_id)
    references public.purchase_requests (id, organization_id, project_id),
  foreign key (supplier_invoice_id, organization_id, project_id)
    references public.supplier_invoices (id, organization_id, project_id),
  -- Причина корректировки обязательна всегда (Д-06).
  check (corrects_receipt_id is null or length(trim(correction_reason)) >= 3),
  unique (id, organization_id, project_id)
);
create unique index goods_receipts_number_key on public.goods_receipts (organization_id, number)
  where number is not null;
create index on public.goods_receipts (organization_id, doc_date desc);
create index on public.goods_receipts (project_id, status);
create index on public.goods_receipts (purchase_request_id);
create index on public.goods_receipts (supplier_id);

create table public.goods_receipt_items (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null,
  project_id               uuid not null,
  goods_receipt_id         uuid not null,
  line_no                  int not null check (line_no > 0),
  material_id              uuid not null,
  unit_id                  uuid not null,
  purchase_request_item_id uuid references public.purchase_request_items (id),
  ordered_quantity         numeric(18, 4),                                       -- заказано (US-02)
  received_quantity        numeric(18, 4) not null check (received_quantity > 0), -- принято → в остаток
  created_at               timestamptz not null default now(),
  created_by               uuid references auth.users (id),
  updated_at               timestamptz not null default now(),
  foreign key (goods_receipt_id, organization_id, project_id)
    references public.goods_receipts (id, organization_id, project_id) on delete cascade,
  foreign key (material_id, organization_id) references public.materials (id, organization_id),
  unique (goods_receipt_id, line_no)
);
create unique index goods_receipt_items_request_item_key on public.goods_receipt_items
  (goods_receipt_id, purchase_request_item_id) where purchase_request_item_id is not null;
create index on public.goods_receipt_items (organization_id);
create index on public.goods_receipt_items (project_id);
create index on public.goods_receipt_items (purchase_request_item_id);
create index on public.goods_receipt_items (material_id);

-- «Заказано» — снимок количества строки заявки; материал строки = материал строки заявки;
-- единица — базовая единица материала (ставится здесь же: порядок триггеров — по алфавиту).
create function private.set_receipt_line_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.purchase_request_item_id is not null then
    select i.quantity, i.material_id into new.ordered_quantity, new.material_id
    from public.purchase_request_items i where i.id = new.purchase_request_item_id;
  else
    new.ordered_quantity := null;
  end if;
  select m.unit_id into new.unit_id from public.materials m where m.id = new.material_id;
  return new;
end $$;

-- -------------------------------------------------------------------------------------
-- 2. Выдачи и возвраты
-- -------------------------------------------------------------------------------------
create table public.material_issues (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id),
  project_id       uuid not null,
  warehouse_id     uuid not null,
  block_id         uuid not null,                       -- US-03: объект, блок, этаж, бригада
  floor_id         uuid not null,
  crew_id          uuid not null,
  received_by_name text,
  number           text,
  doc_date         date not null default private.today(),
  status           public.issue_status not null default 'DRAFT',
  note             text,
  posted_at        timestamptz,
  posted_by        uuid references auth.users (id),
  cancelled_at     timestamptz,                          -- сторно
  cancelled_by     uuid references auth.users (id),
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (warehouse_id, organization_id, project_id)
    references public.warehouses (id, organization_id, project_id),
  foreign key (block_id, project_id) references public.blocks (id, project_id),
  foreign key (floor_id, block_id) references public.floors (id, block_id),
  foreign key (crew_id, organization_id) references public.crews (id, organization_id),
  unique (id, organization_id, project_id)
);
create unique index material_issues_number_key on public.material_issues (organization_id, number)
  where number is not null;
create index on public.material_issues (organization_id, doc_date desc);
create index on public.material_issues (project_id, status);
create index on public.material_issues (crew_id);

create table public.material_issue_items (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  project_id        uuid not null,
  material_issue_id uuid not null,
  line_no           int not null check (line_no > 0),
  material_id       uuid not null,
  unit_id           uuid not null,
  quantity          numeric(18, 4) not null check (quantity > 0),
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  foreign key (material_issue_id, organization_id, project_id)
    references public.material_issues (id, organization_id, project_id) on delete cascade,
  foreign key (material_id, organization_id) references public.materials (id, organization_id),
  unique (material_issue_id, line_no),
  unique (material_issue_id, material_id)
);
create index on public.material_issue_items (organization_id);
create index on public.material_issue_items (project_id);
create index on public.material_issue_items (material_id);

create table public.material_returns (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id),
  project_id        uuid not null,
  warehouse_id      uuid not null,
  material_issue_id uuid not null,                        -- US-04: возврат связан с выдачей
  crew_id           uuid not null,
  number            text,
  doc_date          date not null default private.today(),
  status            public.issue_status not null default 'DRAFT',
  note              text,
  posted_at         timestamptz,
  posted_by         uuid references auth.users (id),
  cancelled_at      timestamptz,
  cancelled_by      uuid references auth.users (id),
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  foreign key (warehouse_id, organization_id, project_id)
    references public.warehouses (id, organization_id, project_id),
  foreign key (material_issue_id, organization_id, project_id)
    references public.material_issues (id, organization_id, project_id),
  foreign key (crew_id, organization_id) references public.crews (id, organization_id),
  unique (id, organization_id, project_id)
);
create unique index material_returns_number_key on public.material_returns (organization_id, number)
  where number is not null;
create index on public.material_returns (organization_id, doc_date desc);
create index on public.material_returns (project_id, status);
create index on public.material_returns (material_issue_id);
create index on public.material_returns (crew_id);

create table public.material_return_items (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null,
  project_id             uuid not null,
  material_return_id     uuid not null,
  line_no                int not null check (line_no > 0),
  material_issue_item_id uuid not null references public.material_issue_items (id),
  material_id            uuid not null,
  unit_id                uuid not null,
  quantity               numeric(18, 4) not null check (quantity > 0),
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id),
  updated_at             timestamptz not null default now(),
  foreign key (material_return_id, organization_id, project_id)
    references public.material_returns (id, organization_id, project_id) on delete cascade,
  foreign key (material_id, organization_id) references public.materials (id, organization_id),
  unique (material_return_id, line_no),
  unique (material_return_id, material_issue_item_id)
);
create index on public.material_return_items (organization_id);
create index on public.material_return_items (project_id);
create index on public.material_return_items (material_issue_item_id);

-- Материал строки возврата = материал строки выдачи.
create function private.set_return_line_material() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select i.material_id, i.unit_id into new.material_id, new.unit_id
  from public.material_issue_items i where i.id = new.material_issue_item_id;
  return new;
end $$;

-- -------------------------------------------------------------------------------------
-- 3. Выполнение заявки: заказано / принято / осталось / расхождение (Д-53). Без цен.
-- -------------------------------------------------------------------------------------
create view public.purchase_request_fulfillment with (security_invoker = true) as
  select i.id as purchase_request_item_id, i.purchase_request_id, i.organization_id, i.project_id, i.line_no,
         i.material_id, i.unit_id, i.supplier_id,
         i.quantity as ordered,
         coalesce(r.received, 0) as received,
         greatest(i.quantity - coalesce(r.received, 0), 0) as remaining,
         coalesce(r.received, 0) - i.quantity as diff
  from public.purchase_request_items i
  left join lateral (
    select sum(gi.received_quantity) as received
    from public.goods_receipt_items gi join public.goods_receipts g on g.id = gi.goods_receipt_id
    where gi.purchase_request_item_id = i.id and g.status = 'POSTED'
  ) r on true;

-- -------------------------------------------------------------------------------------
-- 4. Триггеры
-- -------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['goods_receipts', 'goods_receipt_items', 'material_issues', 'material_issue_items',
                           'material_returns', 'material_return_items'] loop
    execute format('create trigger set_created_by before insert on public.%I
                    for each row execute function private.set_created_by()', t);
    execute format('create trigger before_update_std before update on public.%I
                    for each row execute function private.before_update_std()', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t);
  end loop;
  foreach t in array array['goods_receipts', 'material_issues', 'material_returns'] loop
    execute format('create trigger guard_document before update on public.%I
                    for each row execute function private.guard_document()', t);
    execute format('create trigger set_doc_warehouse before insert on public.%I
                    for each row execute function private.set_doc_warehouse()', t);
  end loop;
end $$;

create trigger guard_lines before insert or update or delete on public.goods_receipt_items
  for each row execute function private.guard_lines('goods_receipts', 'goods_receipt_id', 'DRAFT');
create trigger guard_lines before insert or update or delete on public.material_issue_items
  for each row execute function private.guard_lines('material_issues', 'material_issue_id', 'DRAFT');
create trigger guard_lines before insert or update or delete on public.material_return_items
  for each row execute function private.guard_lines('material_returns', 'material_return_id', 'DRAFT');

create trigger set_receipt_line_order before insert or update on public.goods_receipt_items
  for each row execute function private.set_receipt_line_order();
create trigger set_line_unit before insert or update of material_id on public.material_issue_items
  for each row execute function private.set_line_unit();
create trigger set_return_line_material before insert or update on public.material_return_items
  for each row execute function private.set_return_line_material();

-- -------------------------------------------------------------------------------------
-- 5. RLS (только чтение; запись — функциями, Д-58)
-- -------------------------------------------------------------------------------------
alter table public.goods_receipts        enable row level security;
alter table public.goods_receipt_items   enable row level security;
alter table public.material_issues       enable row level security;
alter table public.material_issue_items  enable row level security;
alter table public.material_returns      enable row level security;
alter table public.material_return_items enable row level security;

create policy goods_receipts_select on public.goods_receipts for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view'));
create policy goods_receipt_items_select on public.goods_receipt_items for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view'));

-- Прораб видит выдачи и возвраты своих бригад (Д-26).
create policy material_issues_select on public.material_issues for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view') or private.is_own_crew(organization_id, crew_id));
create policy material_issue_items_select on public.material_issue_items for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view')
         or exists (select 1 from public.material_issues i where i.id = material_issue_id));
create policy material_returns_select on public.material_returns for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view') or private.is_own_crew(organization_id, crew_id));
create policy material_return_items_select on public.material_return_items for select to authenticated
  using (private.can(organization_id, project_id, 'stock.view')
         or exists (select 1 from public.material_returns r where r.id = material_return_id));

revoke all on public.goods_receipts, public.goods_receipt_items, public.material_issues,
  public.material_issue_items, public.material_returns, public.material_return_items from anon, authenticated;
grant select on public.goods_receipts, public.goods_receipt_items, public.material_issues,
  public.material_issue_items, public.material_returns, public.material_return_items to authenticated;
grant select, insert, update, delete on public.goods_receipts, public.goods_receipt_items,
  public.material_issues, public.material_issue_items, public.material_returns, public.material_return_items
  to service_role;
revoke all on public.purchase_request_fulfillment from anon, authenticated;
grant select on public.purchase_request_fulfillment to authenticated;

-- -------------------------------------------------------------------------------------
-- 6. Приёмка: черновик
-- -------------------------------------------------------------------------------------
-- p_lines: [{material_id, purchase_request_item_id, received_quantity}]. Для черновика корректировки
-- шапка (поставщик, заявка) не меняется — только строки, причина и примечание.
create function public.save_goods_receipt_draft(
  p_id uuid, p_project_id uuid, p_supplier_id uuid, p_purchase_request_id uuid, p_note text,
  p_correction_reason text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_doc public.goods_receipts;
begin
  perform private.require(private.can(v_org, p_project_id, 'goods_receipts.post'), 'BF_FORBIDDEN', '42501');

  select * into v_doc from public.goods_receipts where id = p_id for update;
  if found then
    perform private.require(v_doc.organization_id = v_org and v_doc.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    if v_doc.corrects_receipt_id is null then
      update public.goods_receipts set supplier_id = p_supplier_id, purchase_request_id = p_purchase_request_id,
             note = nullif(trim(p_note), '') where id = p_id;
    else
      update public.goods_receipts set note = nullif(trim(p_note), ''),
             correction_reason = coalesce(nullif(trim(p_correction_reason), ''), correction_reason)
       where id = p_id;
    end if;
    delete from public.goods_receipt_items where goods_receipt_id = p_id;
  else
    insert into public.goods_receipts (id, organization_id, project_id, supplier_id, purchase_request_id, note)
    values (p_id, v_org, p_project_id, p_supplier_id, p_purchase_request_id, nullif(trim(p_note), ''));
  end if;

  insert into public.goods_receipt_items (organization_id, project_id, goods_receipt_id, line_no, material_id,
    unit_id, purchase_request_item_id, received_quantity)
  select v_org, p_project_id, p_id, l.ord::int,
         coalesce(nullif(l.v ->> 'material_id', '')::uuid,
                  (select i.material_id from public.purchase_request_items i
                   where i.id = nullif(l.v ->> 'purchase_request_item_id', '')::uuid)),
         gen_random_uuid(),   -- заменяется триггером set_line_unit
         nullif(l.v ->> 'purchase_request_item_id', '')::uuid, (l.v ->> 'received_quantity')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord)
  where coalesce((l.v ->> 'received_quantity')::numeric, 0) > 0;   -- нулевые строки = «не привезли»

  return p_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 7. Приёмка: проведение (обычное и корректировка)
-- -------------------------------------------------------------------------------------
-- Нужна ли корректировке согласование бухгалтера (Д-06): заявка уже на сверке или закрыта.
create function private.receipt_needs_approval(p_receipt public.goods_receipts) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.purchase_requests r
                 where r.id = p_receipt.purchase_request_id
                   and r.status in ('ACCOUNTING_REVIEW', 'DISCREPANCY', 'CLOSED'))
$$;

-- Общая часть проведения: проверки строк, движения, остатки, статус, номер, заявка.
create function private.apply_goods_receipt(p_doc public.goods_receipts) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_line public.goods_receipt_items;
  v_req public.purchase_requests;
  v_original public.goods_receipts;
  v_result jsonb;
  v_moves uuid[] := '{}';
begin
  if p_doc.purchase_request_id is not null then
    select * into v_req from public.purchase_requests where id = p_doc.purchase_request_id for update;
    if p_doc.corrects_receipt_id is null then
      perform private.require(v_req.status in ('ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED'),
                              'BF_REQUEST_NOT_OPEN', 'P0001', v_req.status::text);
    end if;
    -- Строки заявки — только этой заявки и этого поставщика.
    perform private.require(not exists (
      select 1 from public.goods_receipt_items gi
      join public.purchase_request_items i on i.id = gi.purchase_request_item_id
      where gi.goods_receipt_id = p_doc.id
        and (i.purchase_request_id <> p_doc.purchase_request_id or i.supplier_id is distinct from p_doc.supplier_id)
    ), 'BF_LINE_MISMATCH');
  else
    perform private.require(not exists (select 1 from public.goods_receipt_items
                                        where goods_receipt_id = p_doc.id and purchase_request_item_id is not null),
                            'BF_LINE_MISMATCH');
  end if;

  if p_doc.corrects_receipt_id is null then
    perform private.require(exists (select 1 from public.goods_receipt_items where goods_receipt_id = p_doc.id),
                            'BF_NO_LINES');
  else
    -- Корректировка: сторно исходной приёмки (корректировка до нуля строк = сторно, Д-52).
    select * into v_original from public.goods_receipts where id = p_doc.corrects_receipt_id for update;
    perform private.require(v_original.status = 'POSTED', 'BF_INVALID_STATUS', 'P0001', v_original.status::text);
    v_moves := private.add_reversal_movements('GOODS_RECEIPT', v_original.id, 'RECEIPT_REVERSAL');
    update public.goods_receipts set status = 'CORRECTED' where id = v_original.id;
  end if;

  for v_line in
    select * from public.goods_receipt_items where goods_receipt_id = p_doc.id order by material_id, line_no
  loop
    v_moves := v_moves || private.add_movement(p_doc.organization_id, p_doc.project_id, p_doc.warehouse_id,
      v_line.material_id, v_line.received_quantity, 'RECEIPT', 'GOODS_RECEIPT', p_doc.id, v_line.id, p_doc.doc_date);
  end loop;
  -- Остатки — итоговой дельтой по материалу (корректировка проверяется на минус по итогу).
  perform private.apply_movements(v_moves);

  update public.goods_receipts
     set status = 'POSTED',
         number = coalesce(number, private.next_document_number(organization_id, 'GOODS_RECEIPT', doc_date)),
         posted_at = now(), posted_by = (select auth.uid())
   where id = p_doc.id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  if p_doc.purchase_request_id is not null then
    perform private.recalc_purchase_request(p_doc.purchase_request_id);
  end if;
  return v_result;
end $$;

create function public.post_goods_receipt(p_id uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.goods_receipts;
  v_cached jsonb;
  v_result jsonb;
begin
  -- Блокировка документа сериализует параллельные проведения: второе увидит POSTED.
  select * into v_doc from public.goods_receipts where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'post_goods_receipt', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'goods_receipts.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'DRAFT', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
  if v_doc.corrects_receipt_id is not null then
    perform private.require(not private.receipt_needs_approval(v_doc), 'BF_CORRECTION_NEEDS_APPROVAL');
  end if;

  perform private.begin_posting();
  v_result := private.apply_goods_receipt(v_doc);
  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

-- Черновик корректировки (Д-06) или сторно (Д-52: p_copy_lines = false — до нуля строк).
-- p_new_id генерирует клиент: повтор вызова возвращает тот же черновик.
create function public.create_receipt_correction(
  p_original_id uuid, p_new_id uuid, p_reason text, p_copy_lines boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_original public.goods_receipts;
  v_existing public.goods_receipts;
  v_reason text := private.require_comment(p_reason);
begin
  select * into v_original from public.goods_receipts where id = p_original_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_original.organization_id, v_original.project_id, 'goods_receipts.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_original.status = 'POSTED', 'BF_INVALID_STATUS', 'P0001', v_original.status::text);

  select * into v_existing from public.goods_receipts where corrects_receipt_id = p_original_id;
  if found then
    perform private.require(v_existing.id = p_new_id, 'BF_CORRECTION_EXISTS', 'P0001', v_existing.id::text);
    return v_existing.id;
  end if;

  insert into public.goods_receipts (id, organization_id, project_id, supplier_id, purchase_request_id,
    supplier_invoice_id, corrects_receipt_id, correction_reason, note)
  values (p_new_id, v_original.organization_id, v_original.project_id, v_original.supplier_id,
    v_original.purchase_request_id, v_original.supplier_invoice_id, p_original_id, v_reason, v_original.note);

  if p_copy_lines then
    insert into public.goods_receipt_items (organization_id, project_id, goods_receipt_id, line_no, material_id,
      unit_id, purchase_request_item_id, received_quantity)
    select organization_id, project_id, p_new_id, line_no, material_id, unit_id, purchase_request_item_id,
           received_quantity
    from public.goods_receipt_items where goods_receipt_id = p_original_id;
  end if;
  return p_new_id;
end $$;

create function public.submit_receipt_correction(p_id uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.goods_receipts;
  v_cached jsonb;
  v_result jsonb;
  v_approval uuid;
begin
  select * into v_doc from public.goods_receipts where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'submit_receipt_correction', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'goods_receipts.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'DRAFT' and v_doc.corrects_receipt_id is not null,
                          'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
  perform private.require(private.receipt_needs_approval(v_doc), 'BF_CORRECTION_NO_APPROVAL_NEEDED');

  perform private.begin_posting();
  update public.goods_receipts set status = 'CORRECTION_APPROVAL' where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  insert into public.approval_requests (organization_id, project_id, doc_type, doc_id, required_permission)
  values (v_doc.organization_id, v_doc.project_id, 'GOODS_RECEIPT', p_id, 'goods_receipts.approve_correction')
  returning id into v_approval;
  insert into public.approval_actions (organization_id, approval_request_id, action, comment)
  values (v_doc.organization_id, v_approval, 'SUBMIT', v_doc.correction_reason);

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

-- Решение бухгалтера по корректировке: approve → проведение; return → обратно в черновик.
create function private.decide_receipt_correction(p_id uuid, p_key uuid, p_approve boolean, p_comment text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.goods_receipts;
  v_cached jsonb;
  v_result jsonb;
  v_approval uuid;
  v_comment text := case when p_approve then nullif(trim(p_comment), '') else private.require_comment(p_comment) end;
begin
  select * into v_doc from public.goods_receipts where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key,
    case when p_approve then 'approve_receipt_correction' else 'return_receipt_correction' end, p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(
    private.can(v_doc.organization_id, v_doc.project_id, 'goods_receipts.approve_correction'), 'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'CORRECTION_APPROVAL', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);

  select id into v_approval from public.approval_requests
  where doc_type = 'GOODS_RECEIPT' and doc_id = p_id and status = 'PENDING' for update;

  perform private.begin_posting();
  if p_approve then
    update public.goods_receipts
       set correction_approved_at = now(), correction_approved_by = (select auth.uid())
     where id = p_id
    returning * into v_doc;
    v_result := private.apply_goods_receipt(v_doc);
  else
    update public.goods_receipts set status = 'DRAFT' where id = p_id
    returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;
  end if;

  update public.approval_requests
     set status = case when p_approve then 'APPROVED'::public.approval_status else 'REJECTED' end,
         decided_at = now(), decided_by = (select auth.uid())
   where id = v_approval;
  insert into public.approval_actions (organization_id, approval_request_id, action, comment)
  values (v_doc.organization_id, v_approval,
          case when p_approve then 'APPROVE'::public.approval_action else 'RETURN' end, v_comment);

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.approve_receipt_correction(p_id uuid, p_key uuid, p_comment text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.decide_receipt_correction(p_id, p_key, true, p_comment)
$$;
create function public.return_receipt_correction(p_id uuid, p_key uuid, p_comment text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.decide_receipt_correction(p_id, p_key, false, p_comment)
$$;

-- -------------------------------------------------------------------------------------
-- 8. Выдача: черновик, проведение, сторно
-- -------------------------------------------------------------------------------------
-- p_lines: [{material_id, quantity}]
create function public.save_material_issue_draft(
  p_id uuid, p_project_id uuid, p_block_id uuid, p_floor_id uuid, p_crew_id uuid, p_received_by_name text,
  p_note text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_doc public.material_issues;
begin
  perform private.require(private.can(v_org, p_project_id, 'material_issues.post'), 'BF_FORBIDDEN', '42501');

  select * into v_doc from public.material_issues where id = p_id for update;
  if found then
    perform private.require(v_doc.organization_id = v_org and v_doc.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    update public.material_issues
       set block_id = p_block_id, floor_id = p_floor_id, crew_id = p_crew_id,
           received_by_name = nullif(trim(p_received_by_name), ''), note = nullif(trim(p_note), '')
     where id = p_id;
    delete from public.material_issue_items where material_issue_id = p_id;
  else
    insert into public.material_issues (id, organization_id, project_id, block_id, floor_id, crew_id,
      received_by_name, note)
    values (p_id, v_org, p_project_id, p_block_id, p_floor_id, p_crew_id, nullif(trim(p_received_by_name), ''),
      nullif(trim(p_note), ''));
  end if;

  insert into public.material_issue_items (organization_id, project_id, material_issue_id, line_no, material_id,
    unit_id, quantity)
  select v_org, p_project_id, p_id, l.ord::int, (l.v ->> 'material_id')::uuid, gen_random_uuid(),
         (l.v ->> 'quantity')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord)
  where coalesce((l.v ->> 'quantity')::numeric, 0) > 0;

  return p_id;
end $$;

create function public.post_material_issue(p_id uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.material_issues;
  v_line public.material_issue_items;
  v_cached jsonb;
  v_result jsonb;
  v_moves uuid[] := '{}';
begin
  select * into v_doc from public.material_issues where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'post_material_issue', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'material_issues.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'DRAFT', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
  perform private.require(exists (select 1 from public.material_issue_items where material_issue_id = p_id),
                          'BF_NO_LINES');
  perform private.require(exists (select 1 from public.crews where id = v_doc.crew_id and is_active),
                          'BF_CREW_INACTIVE');

  perform private.begin_posting();
  for v_line in select * from public.material_issue_items where material_issue_id = p_id order by material_id loop
    v_moves := v_moves || private.add_movement(v_doc.organization_id, v_doc.project_id, v_doc.warehouse_id,
      v_line.material_id, -v_line.quantity, 'ISSUE', 'MATERIAL_ISSUE', p_id, v_line.id, v_doc.doc_date);
  end loop;
  perform private.apply_movements(v_moves);   -- минус → BF_NEGATIVE_STOCK с остатком (Д-19)

  update public.material_issues
     set status = 'POSTED',
         number = coalesce(number, private.next_document_number(organization_id, 'MATERIAL_ISSUE', doc_date)),
         posted_at = now(), posted_by = (select auth.uid())
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.reverse_material_issue(p_id uuid, p_key uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.material_issues;
  v_cached jsonb;
  v_result jsonb;
  v_reason text;
begin
  select * into v_doc from public.material_issues where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'reverse_material_issue', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'material_issues.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'POSTED', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
  v_reason := private.require_comment(p_reason);
  -- Сначала сторнируются возвраты по выдаче (§4.4).
  perform private.require(not exists (select 1 from public.material_returns
                                      where material_issue_id = p_id and status = 'POSTED'), 'BF_HAS_RETURNS');

  perform private.begin_posting();
  perform private.apply_movements(private.add_reversal_movements('MATERIAL_ISSUE', p_id, 'ISSUE_REVERSAL'));

  update public.material_issues
     set status = 'REVERSED', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = v_reason
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

-- -------------------------------------------------------------------------------------
-- 9. Возврат: черновик, проведение, сторно
-- -------------------------------------------------------------------------------------
-- p_lines: [{material_issue_item_id, quantity}]
create function public.save_material_return_draft(p_id uuid, p_material_issue_id uuid, p_note text, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_issue public.material_issues;
  v_doc public.material_returns;
begin
  select * into v_issue from public.material_issues where id = p_material_issue_id;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_issue.organization_id, v_issue.project_id, 'material_issues.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_issue.status = 'POSTED', 'BF_ISSUE_NOT_POSTED');

  select * into v_doc from public.material_returns where id = p_id for update;
  if found then
    perform private.require(v_doc.material_issue_id = p_material_issue_id, 'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    update public.material_returns set note = nullif(trim(p_note), '') where id = p_id;
    delete from public.material_return_items where material_return_id = p_id;
  else
    insert into public.material_returns (id, organization_id, project_id, material_issue_id, crew_id, note)
    values (p_id, v_issue.organization_id, v_issue.project_id, p_material_issue_id, v_issue.crew_id,
            nullif(trim(p_note), ''));
  end if;

  insert into public.material_return_items (organization_id, project_id, material_return_id, line_no,
    material_issue_item_id, material_id, unit_id, quantity)
  select v_issue.organization_id, v_issue.project_id, p_id, l.ord::int,
         (l.v ->> 'material_issue_item_id')::uuid, gen_random_uuid(), gen_random_uuid(), (l.v ->> 'quantity')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord)
  where coalesce((l.v ->> 'quantity')::numeric, 0) > 0;

  -- Строки только этой выдачи.
  perform private.require(not exists (
    select 1 from public.material_return_items ri join public.material_issue_items ii on ii.id = ri.material_issue_item_id
    where ri.material_return_id = p_id and ii.material_issue_id <> p_material_issue_id), 'BF_LINE_MISMATCH');
  return p_id;
end $$;

create function public.post_material_return(p_id uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.material_returns;
  v_line record;
  v_cached jsonb;
  v_result jsonb;
  v_moves uuid[] := '{}';
begin
  select * into v_doc from public.material_returns where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'post_material_return', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'material_issues.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'DRAFT', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
  perform private.require(exists (select 1 from public.material_return_items where material_return_id = p_id),
                          'BF_NO_LINES');
  -- Блокировка выдачи сериализует параллельные возвраты по ней.
  perform 1 from public.material_issues where id = v_doc.material_issue_id and status = 'POSTED' for update;
  perform private.require(found, 'BF_ISSUE_NOT_POSTED');

  perform private.begin_posting();
  for v_line in
    select ri.*, ii.quantity as issued, m.name as material_name, u.code as unit_code,
           coalesce((select sum(r2i.quantity) from public.material_return_items r2i
                     join public.material_returns r2 on r2.id = r2i.material_return_id
                     where r2i.material_issue_item_id = ri.material_issue_item_id and r2.status = 'POSTED'), 0)
             as already_returned
    from public.material_return_items ri
    join public.material_issue_items ii on ii.id = ri.material_issue_item_id
    join public.materials m on m.id = ri.material_id
    join public.units_of_measure u on u.id = m.unit_id
    where ri.material_return_id = p_id
    order by ri.material_id
  loop
    -- Вернуть можно не больше выданного (US-04).
    perform private.require(v_line.already_returned + v_line.quantity <= v_line.issued, 'BF_RETURN_EXCEEDS_ISSUED',
      'P0001', jsonb_build_object('material', v_line.material_name, 'unit', v_line.unit_code,
                                  'issued', v_line.issued, 'returned', v_line.already_returned,
                                  'requested', v_line.quantity)::text);
    v_moves := v_moves || private.add_movement(v_doc.organization_id, v_doc.project_id, v_doc.warehouse_id,
      v_line.material_id, v_line.quantity, 'RETURN', 'MATERIAL_RETURN', p_id, v_line.id, v_doc.doc_date);
  end loop;
  perform private.apply_movements(v_moves);

  update public.material_returns
     set status = 'POSTED',
         number = coalesce(number, private.next_document_number(organization_id, 'MATERIAL_RETURN', doc_date)),
         posted_at = now(), posted_by = (select auth.uid())
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.reverse_material_return(p_id uuid, p_key uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.material_returns;
  v_cached jsonb;
  v_result jsonb;
  v_reason text;
begin
  select * into v_doc from public.material_returns where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'reverse_material_return', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'material_issues.post'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'POSTED', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
  v_reason := private.require_comment(p_reason);

  perform private.begin_posting();
  -- Возвращённое уже выдали снова → BF_NEGATIVE_STOCK.
  perform private.apply_movements(private.add_reversal_movements('MATERIAL_RETURN', p_id, 'RETURN_REVERSAL'));

  update public.material_returns
     set status = 'REVERSED', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = v_reason
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

-- -------------------------------------------------------------------------------------
-- 10. Удаление черновика (номера у черновиков нет — дыр в нумерации не будет, Д-10)
-- -------------------------------------------------------------------------------------
create function public.delete_document_draft(p_doc_type public.document_type, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_table text;
  v_draft text;
  v_perm  text;
  v_org uuid;
  v_project uuid;
  v_status text;
  v_number text;
begin
  select t.tbl, t.draft, t.perm into v_table, v_draft, v_perm
  from (values ('PURCHASE_REQUEST', 'purchase_requests', 'DRAFT', 'purchase_requests.manage'),
               ('SUPPLIER_INVOICE', 'supplier_invoices', 'ENTERED', 'supplier_invoices.manage'),
               ('GOODS_RECEIPT', 'goods_receipts', 'DRAFT', 'goods_receipts.post'),
               ('MATERIAL_ISSUE', 'material_issues', 'DRAFT', 'material_issues.post'),
               ('MATERIAL_RETURN', 'material_returns', 'DRAFT', 'material_issues.post')) as t(dt, tbl, draft, perm)
  where t.dt = p_doc_type::text;
  perform private.require(v_table is not null, 'BF_NOT_FOUND', 'P0002');

  execute format('select organization_id, project_id, status::text, number from public.%I where id = $1 for update',
                 v_table) into v_org, v_project, v_status, v_number using p_id;
  perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_org, v_project, v_perm), 'BF_FORBIDDEN', '42501');
  perform private.require(v_status = v_draft and v_number is null, 'BF_DOCUMENT_LOCKED');
  execute format('delete from public.%I where id = $1', v_table) using p_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 11. Вложения: сканы накладных — только prices.view (на них цены, §5.4); фото приёмки — stock.view.
--     Путь в хранилище: {organization_id}/{doc_type}/{doc_id}/{файл}.
-- -------------------------------------------------------------------------------------
create function private.attachment_allowed(p_org uuid, p_doc_type text, p_doc_id uuid, p_write boolean)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_project uuid;
begin
  if p_doc_type = 'SUPPLIER_INVOICE' then
    select project_id into v_project from public.supplier_invoices where id = p_doc_id and organization_id = p_org;
    if v_project is null then return false; end if;
    return case when p_write then private.can(p_org, v_project, 'supplier_invoices.manage')
                else private.can(p_org, v_project, 'supplier_invoices.view')
                     and private.can(p_org, v_project, 'prices.view') end;
  elsif p_doc_type = 'GOODS_RECEIPT' then
    select project_id into v_project from public.goods_receipts where id = p_doc_id and organization_id = p_org;
    if v_project is null then return false; end if;
    return case when p_write then private.can(p_org, v_project, 'goods_receipts.post')
                else private.can(p_org, v_project, 'stock.view') end;
  end if;
  return false;
end $$;

create function private.attachment_path_allowed(p_path text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_path, '/');
begin
  if array_length(v_parts, 1) <> 4 then return false; end if;
  return private.attachment_allowed(v_parts[1]::uuid, v_parts[2], v_parts[3]::uuid, p_write);
exception when invalid_text_representation then
  return false;
end $$;

create policy document_attachments_select on public.document_attachments for select to authenticated
  using (private.attachment_allowed(organization_id, doc_type::text, doc_id, false));

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and private.attachment_path_allowed(name, false));
create policy documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.attachment_path_allowed(name, true));
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and private.attachment_path_allowed(name, true));

-- Метаданные вложения после загрузки файла (файл уже прошёл политику documents_write).
create function public.add_document_attachment(
  p_doc_type public.document_type, p_doc_id uuid, p_storage_path text, p_file_name text, p_mime_type text,
  p_size_bytes bigint
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_storage_path, '/');
  v_org uuid;
  v_project uuid;
  v_id uuid;
begin
  perform private.require(array_length(v_parts, 1) = 4 and v_parts[2] = p_doc_type::text
                          and v_parts[3] = p_doc_id::text, 'BF_FORBIDDEN', '42501');
  v_org := v_parts[1]::uuid;
  perform private.require(private.attachment_allowed(v_org, p_doc_type::text, p_doc_id, true), 'BF_FORBIDDEN', '42501');
  v_project := case p_doc_type
    when 'SUPPLIER_INVOICE' then (select project_id from public.supplier_invoices where id = p_doc_id)
    when 'GOODS_RECEIPT' then (select project_id from public.goods_receipts where id = p_doc_id) end;

  insert into public.document_attachments (organization_id, project_id, doc_type, doc_id, storage_path, file_name,
    mime_type, size_bytes)
  values (v_org, v_project, p_doc_type, p_doc_id, p_storage_path, p_file_name, p_mime_type, p_size_bytes)
  returning id into v_id;
  return v_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 12. Гранты функций
-- -------------------------------------------------------------------------------------
revoke all on function private.set_receipt_line_order(), private.set_return_line_material(),
  private.receipt_needs_approval(public.goods_receipts), private.apply_goods_receipt(public.goods_receipts),
  private.decide_receipt_correction(uuid, uuid, boolean, text),
  private.attachment_allowed(uuid, text, uuid, boolean), private.attachment_path_allowed(text, boolean)
  from public, anon, authenticated;
grant execute on function private.attachment_allowed(uuid, text, uuid, boolean),
  private.attachment_path_allowed(text, boolean) to authenticated;

revoke all on function
  public.save_goods_receipt_draft(uuid, uuid, uuid, uuid, text, text, jsonb), public.post_goods_receipt(uuid, uuid),
  public.create_receipt_correction(uuid, uuid, text, boolean), public.submit_receipt_correction(uuid, uuid),
  public.approve_receipt_correction(uuid, uuid, text), public.return_receipt_correction(uuid, uuid, text),
  public.save_material_issue_draft(uuid, uuid, uuid, uuid, uuid, text, text, jsonb),
  public.post_material_issue(uuid, uuid), public.reverse_material_issue(uuid, uuid, text),
  public.save_material_return_draft(uuid, uuid, text, jsonb), public.post_material_return(uuid, uuid),
  public.reverse_material_return(uuid, uuid, text), public.delete_document_draft(public.document_type, uuid),
  public.add_document_attachment(public.document_type, uuid, text, text, text, bigint)
  from public, anon;
grant execute on function
  public.save_goods_receipt_draft(uuid, uuid, uuid, uuid, text, text, jsonb), public.post_goods_receipt(uuid, uuid),
  public.create_receipt_correction(uuid, uuid, text, boolean), public.submit_receipt_correction(uuid, uuid),
  public.approve_receipt_correction(uuid, uuid, text), public.return_receipt_correction(uuid, uuid, text),
  public.save_material_issue_draft(uuid, uuid, uuid, uuid, uuid, text, text, jsonb),
  public.post_material_issue(uuid, uuid), public.reverse_material_issue(uuid, uuid, text),
  public.save_material_return_draft(uuid, uuid, text, jsonb), public.post_material_return(uuid, uuid),
  public.reverse_material_return(uuid, uuid, text), public.delete_document_draft(public.document_type, uuid),
  public.add_document_attachment(public.document_type, uuid, text, text, text, bigint)
  to authenticated;

-- ROLLBACK:
--   drop policy documents_read, documents_write, documents_delete on storage.objects;
--   drop view public.purchase_request_fulfillment;
--   drop table public.material_return_items, public.material_returns, public.material_issue_items,
--     public.material_issues, public.goods_receipt_items, public.goods_receipts cascade;
--   drop function (все функции этого файла);
--   drop type public.issue_status, public.goods_receipt_status;
