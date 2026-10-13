-- =====================================================================================
-- 0005 Закупки (BP-01, BP-03 в части накладных): заявки и накладные поставщиков.
-- ARCHITECTURE §2.4, §4.1, §4.2, §5.4; решения Д-13, Д-14, Д-53, Д-54, Д-58.
-- Все изменения документов — только функциями (Д-58); клиенту — только SELECT без цен.
-- =====================================================================================

create type public.purchase_request_status as enum (
  'DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'ACCOUNTING_REVIEW', 'DISCREPANCY', 'CLOSED', 'CANCELLED'
);
create type public.supplier_invoice_status as enum ('ENTERED', 'UNDER_REVIEW', 'CONFIRMED', 'CANCELLED');

-- -------------------------------------------------------------------------------------
-- 1. Заявки
-- -------------------------------------------------------------------------------------
create table public.purchase_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid not null,
  warehouse_id    uuid not null,
  number          text,
  doc_date        date not null default private.today(),
  status          public.purchase_request_status not null default 'DRAFT',
  needed_by       date,
  currency        char(3) not null default 'TJS' check (currency ~ '^[A-Z]{3}$'),   -- Д-54
  has_discrepancy boolean not null default false,                                    -- Д-53
  status_comment  text,
  note            text,
  posted_at       timestamptz,
  posted_by       uuid references auth.users (id),
  cancelled_at    timestamptz,
  cancelled_by    uuid references auth.users (id),
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (warehouse_id, organization_id, project_id)
    references public.warehouses (id, organization_id, project_id),
  unique (id, organization_id, project_id)
);
create unique index purchase_requests_number_key on public.purchase_requests (organization_id, number)
  where number is not null;
create index on public.purchase_requests (organization_id, doc_date desc);
create index on public.purchase_requests (project_id, status);

create table public.purchase_request_items (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  project_id          uuid not null,
  purchase_request_id uuid not null,
  line_no             int not null check (line_no > 0),
  material_id         uuid not null,
  unit_id             uuid not null,
  quantity            numeric(18, 4) not null check (quantity > 0),
  supplier_id         uuid,                                                -- несколько поставщиков на заявку
  price               numeric(18, 4) check (price >= 0),                   -- 🔒
  amount              numeric(18, 2) generated always as (round(quantity * price, 2)) stored,   -- 🔒
  note                text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id),
  updated_at          timestamptz not null default now(),
  foreign key (purchase_request_id, organization_id, project_id)
    references public.purchase_requests (id, organization_id, project_id) on delete cascade,
  foreign key (material_id, organization_id) references public.materials (id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  unique (purchase_request_id, line_no),
  unique (id, purchase_request_id)
);
create index on public.purchase_request_items (organization_id);
create index on public.purchase_request_items (project_id);
create index on public.purchase_request_items (material_id);
create index on public.purchase_request_items (supplier_id);

-- -------------------------------------------------------------------------------------
-- 2. Накладные поставщиков
-- -------------------------------------------------------------------------------------
create table public.supplier_invoices (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id),
  project_id          uuid not null,                                       -- Д-08
  supplier_id         uuid not null,
  purchase_request_id uuid,
  number              text,
  doc_date            date not null default private.today(),
  status              public.supplier_invoice_status not null default 'ENTERED',
  supplier_doc_number text not null check (length(trim(supplier_doc_number)) > 0),
  supplier_doc_date   date not null,
  currency            char(3) not null default 'TJS' check (currency ~ '^[A-Z]{3}$'),
  total_amount        numeric(18, 2) not null default 0,                    -- 🔒 кэш суммы строк
  note                text,
  posted_at           timestamptz,
  posted_by           uuid references auth.users (id),
  confirmed_at        timestamptz,
  confirmed_by        uuid references auth.users (id),   -- Д-14: может совпадать с автором (сверка, не согласование)
  cancelled_at        timestamptz,
  cancelled_by        uuid references auth.users (id),
  cancel_reason       text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id),
  updated_at          timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (purchase_request_id, organization_id, project_id)
    references public.purchase_requests (id, organization_id, project_id),
  unique (id, organization_id, project_id)
);
create unique index supplier_invoices_number_key on public.supplier_invoices (organization_id, number)
  where number is not null;
-- Защита от двойного ввода одной бумажной накладной.
create unique index supplier_invoices_supplier_doc_key on public.supplier_invoices
  (organization_id, supplier_id, supplier_doc_number, supplier_doc_date) where status <> 'CANCELLED';
create index on public.supplier_invoices (organization_id, doc_date desc);
create index on public.supplier_invoices (project_id, status);
create index on public.supplier_invoices (supplier_id);
create index on public.supplier_invoices (purchase_request_id);

create table public.supplier_invoice_items (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null,
  project_id               uuid not null,
  supplier_invoice_id      uuid not null,
  line_no                  int not null check (line_no > 0),
  material_id              uuid,                       -- NULL — строка услуги (Д-13)
  description              text,
  unit_id                  uuid not null,
  quantity                 numeric(18, 4) not null check (quantity > 0),
  price                    numeric(18, 4) not null check (price >= 0),                               -- 🔒
  amount                   numeric(18, 2) generated always as (round(quantity * price, 2)) stored,   -- 🔒
  purchase_request_item_id uuid references public.purchase_request_items (id),
  created_at               timestamptz not null default now(),
  created_by               uuid references auth.users (id),
  updated_at               timestamptz not null default now(),
  foreign key (supplier_invoice_id, organization_id, project_id)
    references public.supplier_invoices (id, organization_id, project_id) on delete cascade,
  foreign key (material_id, organization_id) references public.materials (id, organization_id),
  foreign key (unit_id, organization_id) references public.units_of_measure (id, organization_id),
  check (material_id is not null or length(trim(description)) > 0),
  unique (supplier_invoice_id, line_no)
);
create index on public.supplier_invoice_items (organization_id);
create index on public.supplier_invoice_items (project_id);
create index on public.supplier_invoice_items (material_id);
create index on public.supplier_invoice_items (purchase_request_item_id);

-- Сумма накладной — кэш (пересчитывается при любом изменении строк).
create function private.recalc_invoice_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(new.supplier_invoice_id, old.supplier_invoice_id);
begin
  -- Статус не меняется — флаг проведения не нужен (guard_document следит только за статусом/номером).
  update public.supplier_invoices
     set total_amount = coalesce((select sum(i.amount) from public.supplier_invoice_items i
                                  where i.supplier_invoice_id = v_id), 0)
   where id = v_id;
  return null;
end $$;

-- -------------------------------------------------------------------------------------
-- 3. Триггеры
-- -------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['purchase_requests', 'purchase_request_items', 'supplier_invoices',
                           'supplier_invoice_items'] loop
    execute format('create trigger set_created_by before insert on public.%I
                    for each row execute function private.set_created_by()', t);
    execute format('create trigger before_update_std before update on public.%I
                    for each row execute function private.before_update_std()', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t);
  end loop;
end $$;

create trigger guard_document before update on public.purchase_requests
  for each row execute function private.guard_document();
create trigger guard_document before update on public.supplier_invoices
  for each row execute function private.guard_document();
create trigger set_doc_warehouse before insert on public.purchase_requests
  for each row execute function private.set_doc_warehouse();

create trigger guard_lines before insert or update or delete on public.purchase_request_items
  for each row execute function private.guard_lines('purchase_requests', 'purchase_request_id', 'DRAFT');
create trigger guard_lines before insert or update or delete on public.supplier_invoice_items
  for each row execute function private.guard_lines('supplier_invoices', 'supplier_invoice_id', 'ENTERED');
create trigger set_line_unit before insert or update of material_id on public.purchase_request_items
  for each row execute function private.set_line_unit();
create trigger set_line_unit before insert or update of material_id on public.supplier_invoice_items
  for each row execute function private.set_line_unit();
create trigger recalc_invoice_total after insert or update or delete on public.supplier_invoice_items
  for each row execute function private.recalc_invoice_total();

-- -------------------------------------------------------------------------------------
-- 4. RLS (только чтение; запись — функциями)
-- -------------------------------------------------------------------------------------
alter table public.purchase_requests      enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.supplier_invoices      enable row level security;
alter table public.supplier_invoice_items enable row level security;

create policy purchase_requests_select on public.purchase_requests for select to authenticated
  using (private.can(organization_id, project_id, 'purchase_requests.view'));
create policy purchase_request_items_select on public.purchase_request_items for select to authenticated
  using (private.can(organization_id, project_id, 'purchase_requests.view'));
create policy supplier_invoices_select on public.supplier_invoices for select to authenticated
  using (private.can(organization_id, project_id, 'supplier_invoices.view'));
create policy supplier_invoice_items_select on public.supplier_invoice_items for select to authenticated
  using (private.can(organization_id, project_id, 'supplier_invoices.view'));

-- -------------------------------------------------------------------------------------
-- 5. Цены (§5.4, Д-24): ценовые колонки не читает НИКТО через таблицы;
--    только через *_priced с проверкой prices.view.
-- -------------------------------------------------------------------------------------
revoke all on public.purchase_requests, public.purchase_request_items, public.supplier_invoices,
  public.supplier_invoice_items from anon, authenticated;

grant select on public.purchase_requests to authenticated;
grant select (id, organization_id, project_id, purchase_request_id, line_no, material_id, unit_id, quantity,
              supplier_id, note, created_at, created_by, updated_at)
  on public.purchase_request_items to authenticated;
grant select (id, organization_id, project_id, supplier_id, purchase_request_id, number, doc_date, status,
              supplier_doc_number, supplier_doc_date, currency, note, posted_at, posted_by, confirmed_at,
              confirmed_by, cancelled_at, cancelled_by, cancel_reason, created_at, created_by, updated_at)
  on public.supplier_invoices to authenticated;
grant select (id, organization_id, project_id, supplier_invoice_id, line_no, material_id, description, unit_id,
              quantity, purchase_request_item_id, created_at, created_by, updated_at)
  on public.supplier_invoice_items to authenticated;
grant select, insert, update, delete on public.purchase_requests, public.purchase_request_items,
  public.supplier_invoices, public.supplier_invoice_items to service_role;

-- Витрины с ценами. Владелец (postgres) обходит RLS и гранты базовых таблиц — поэтому фильтр
-- повторяет SELECT-политику и добавляет prices.view. security_barrier: условие не обойти функциями в WHERE.
create view public.purchase_request_items_priced with (security_barrier = true) as
  select i.id, i.organization_id, i.project_id, i.purchase_request_id, i.line_no, i.material_id, i.unit_id,
         i.quantity, i.supplier_id, i.price, i.amount, i.note
  from public.purchase_request_items i
  where private.can(i.organization_id, i.project_id, 'purchase_requests.view')
    and private.can(i.organization_id, i.project_id, 'prices.view');

create view public.supplier_invoices_priced with (security_barrier = true) as
  select v.id, v.organization_id, v.project_id, v.total_amount, v.currency
  from public.supplier_invoices v
  where private.can(v.organization_id, v.project_id, 'supplier_invoices.view')
    and private.can(v.organization_id, v.project_id, 'prices.view');

create view public.supplier_invoice_items_priced with (security_barrier = true) as
  select i.id, i.organization_id, i.project_id, i.supplier_invoice_id, i.line_no, i.material_id, i.description,
         i.unit_id, i.quantity, i.price, i.amount, i.purchase_request_item_id
  from public.supplier_invoice_items i
  where private.can(i.organization_id, i.project_id, 'supplier_invoices.view')
    and private.can(i.organization_id, i.project_id, 'prices.view');

revoke all on public.purchase_request_items_priced, public.supplier_invoices_priced,
  public.supplier_invoice_items_priced from anon, authenticated;
grant select on public.purchase_request_items_priced, public.supplier_invoices_priced,
  public.supplier_invoice_items_priced to authenticated;

-- -------------------------------------------------------------------------------------
-- 6. Общие хелперы функций документов
-- -------------------------------------------------------------------------------------
create function private.require(p_ok boolean, p_message text, p_errcode text default 'P0001',
                                p_detail text default null) returns void
language plpgsql set search_path = '' as $$
begin
  if not coalesce(p_ok, false) then
    raise exception using errcode = p_errcode, message = p_message, detail = coalesce(p_detail, '');
  end if;
end $$;

create function private.require_comment(p_comment text) returns text
language plpgsql set search_path = '' as $$
begin
  perform private.require(length(trim(coalesce(p_comment, ''))) >= 3, 'BF_REASON_REQUIRED');
  return trim(p_comment);
end $$;

-- Организация объекта + проверка, что пользователь — её участник.
create function private.project_org(p_project uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := (select organization_id from public.projects where id = p_project);
begin
  perform private.require(v_org is not null and private.is_member(v_org), 'BF_FORBIDDEN', '42501');
  return v_org;
end $$;

-- -------------------------------------------------------------------------------------
-- 7. Заявка: черновик
-- -------------------------------------------------------------------------------------
-- p_lines: [{material_id, quantity, supplier_id, price, note}]. Строки заменяются целиком (черновик).
create function public.save_purchase_request_draft(
  p_id uuid, p_project_id uuid, p_needed_by date, p_currency text, p_note text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_doc public.purchase_requests;
begin
  perform private.require(private.can(v_org, p_project_id, 'purchase_requests.manage'), 'BF_FORBIDDEN', '42501');

  select * into v_doc from public.purchase_requests where id = p_id for update;
  if found then
    perform private.require(v_doc.organization_id = v_org and v_doc.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    update public.purchase_requests
       set needed_by = p_needed_by, currency = coalesce(upper(p_currency), 'TJS'), note = nullif(trim(p_note), '')
     where id = p_id;
    delete from public.purchase_request_items where purchase_request_id = p_id;
  else
    insert into public.purchase_requests (id, organization_id, project_id, needed_by, currency, note)
    values (p_id, v_org, p_project_id, p_needed_by, coalesce(upper(p_currency), 'TJS'), nullif(trim(p_note), ''));
  end if;

  insert into public.purchase_request_items (organization_id, project_id, purchase_request_id, line_no,
    material_id, unit_id, quantity, supplier_id, price, note)
  select v_org, p_project_id, p_id, l.ord::int, (l.v ->> 'material_id')::uuid,
         (select m.unit_id from public.materials m where m.id = (l.v ->> 'material_id')::uuid),
         (l.v ->> 'quantity')::numeric, nullif(l.v ->> 'supplier_id', '')::uuid,
         nullif(l.v ->> 'price', '')::numeric, nullif(trim(l.v ->> 'note'), '')
  from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord);

  return p_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 8. Заявка: пересчёт статуса по приёмкам (система, §4.1) и флаг расхождения (Д-53)
-- -------------------------------------------------------------------------------------
create function private.recalc_purchase_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.purchase_requests;
  v_any boolean;
  v_all boolean;
  v_over boolean;
  v_status public.purchase_request_status;
begin
  select * into v_req from public.purchase_requests where id = p_request for update;
  if not found then return; end if;

  with lines as (
    select i.id, i.quantity as ordered,
           coalesce((select sum(gi.received_quantity) from public.goods_receipt_items gi
                     join public.goods_receipts g on g.id = gi.goods_receipt_id
                     where gi.purchase_request_item_id = i.id and g.status = 'POSTED'), 0) as received
    from public.purchase_request_items i where i.purchase_request_id = p_request
  )
  select coalesce(bool_or(received > 0), false), coalesce(bool_and(received >= ordered), false),
         coalesce(bool_or(received > ordered), false)
    into v_any, v_all, v_over
  from lines;

  -- Материалы, принятые по заявке сверх её строк, — тоже расхождение.
  v_over := v_over or exists (
    select 1 from public.goods_receipts g join public.goods_receipt_items gi on gi.goods_receipt_id = g.id
    where g.purchase_request_id = p_request and g.status = 'POSTED' and gi.purchase_request_item_id is null);

  perform private.begin_posting();
  if v_req.status in ('ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED') then
    v_status := case when not v_any then 'ISSUED' when v_all then 'RECEIVED' else 'PARTIALLY_RECEIVED' end;
    update public.purchase_requests
       set status = v_status, has_discrepancy = v_req.has_discrepancy or v_over
     where id = p_request and (status <> v_status or (v_over and not has_discrepancy));
  elsif v_over and not v_req.has_discrepancy then
    update public.purchase_requests set has_discrepancy = true where id = p_request;
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 9. Заявка: переходы (§4.1). Все — с idempotency key.
-- -------------------------------------------------------------------------------------
create function private.request_transition(
  p_id uuid, p_key uuid, p_operation text, p_from public.purchase_request_status[],
  p_to public.purchase_request_status, p_comment text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.purchase_requests;
  v_cached jsonb;
  v_result jsonb;
  v_comment text := p_comment;
begin
  select * into v_doc from public.purchase_requests where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, p_operation, p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'purchase_requests.manage'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = any (p_from), 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);

  if p_operation = 'issue_purchase_request' then
    perform private.require(exists (select 1 from public.purchase_request_items where purchase_request_id = p_id),
                            'BF_NO_LINES');
    perform private.require(not exists (select 1 from public.purchase_request_items
                                        where purchase_request_id = p_id and (supplier_id is null or price is null)),
                            'BF_LINE_INCOMPLETE');
  elsif p_operation = 'cancel_purchase_request' then
    v_comment := private.require_comment(p_comment);
    perform private.require(not exists (select 1 from public.goods_receipts
                                        where purchase_request_id = p_id and status <> 'DRAFT'),
                            'BF_HAS_RECEIPTS');
  elsif p_operation = 'start_purchase_review' then
    perform private.require(not exists (select 1 from public.goods_receipts
                                        where purchase_request_id = p_id and status in ('DRAFT', 'CORRECTION_APPROVAL')),
                            'BF_HAS_DRAFT_RECEIPTS');
  elsif p_operation in ('mark_purchase_discrepancy', 'resolve_purchase_discrepancy') then
    v_comment := private.require_comment(p_comment);   -- правила разрешения — TODO(TZ-open), Д-53
  elsif p_operation = 'close_purchase_request' then
    perform private.require(not exists (select 1 from public.supplier_invoices
                                        where purchase_request_id = p_id and status in ('ENTERED', 'UNDER_REVIEW')),
                            'BF_OPEN_INVOICES');
  end if;

  perform private.begin_posting();
  update public.purchase_requests
     set status = p_to,
         number = case when p_to = 'ISSUED' and number is null
                       then private.next_document_number(organization_id, 'PURCHASE_REQUEST', doc_date)
                       else number end,
         posted_at = case when p_to = 'ISSUED' then now() else posted_at end,
         posted_by = case when p_to = 'ISSUED' then (select auth.uid()) else posted_by end,
         cancelled_at = case when p_to = 'CANCELLED' then now() else cancelled_at end,
         cancelled_by = case when p_to = 'CANCELLED' then (select auth.uid()) else cancelled_by end,
         cancel_reason = case when p_to = 'CANCELLED' then v_comment else cancel_reason end,
         status_comment = coalesce(v_comment, status_comment),
         has_discrepancy = case
           -- Д-53: при начале сверки расхождение — любая строка, где принято ≠ заказано.
           when p_operation = 'start_purchase_review' then has_discrepancy or exists (
             select 1 from public.purchase_request_items i
             where i.purchase_request_id = p_id and i.quantity <> coalesce((
               select sum(gi.received_quantity) from public.goods_receipt_items gi
               join public.goods_receipts g on g.id = gi.goods_receipt_id
               where gi.purchase_request_item_id = i.id and g.status = 'POSTED'), 0))
           when p_operation = 'mark_purchase_discrepancy' then true
           else has_discrepancy end
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.issue_purchase_request(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.request_transition(p_id, p_key, 'issue_purchase_request', '{DRAFT}', 'ISSUED')
$$;
create function public.cancel_purchase_request(p_id uuid, p_key uuid, p_reason text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.request_transition(p_id, p_key, 'cancel_purchase_request', '{DRAFT,ISSUED}', 'CANCELLED', p_reason)
$$;
create function public.start_purchase_review(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.request_transition(p_id, p_key, 'start_purchase_review',
                                    '{PARTIALLY_RECEIVED,RECEIVED}', 'ACCOUNTING_REVIEW')
$$;
create function public.mark_purchase_discrepancy(p_id uuid, p_key uuid, p_comment text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.request_transition(p_id, p_key, 'mark_purchase_discrepancy', '{ACCOUNTING_REVIEW}',
                                    'DISCREPANCY', p_comment)
$$;
create function public.resolve_purchase_discrepancy(p_id uuid, p_key uuid, p_comment text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.request_transition(p_id, p_key, 'resolve_purchase_discrepancy', '{DISCREPANCY}',
                                    'ACCOUNTING_REVIEW', p_comment)
$$;
create function public.close_purchase_request(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.request_transition(p_id, p_key, 'close_purchase_request', '{ACCOUNTING_REVIEW}', 'CLOSED')
$$;

-- -------------------------------------------------------------------------------------
-- 10. Накладная: черновик и переходы (§4.2)
-- -------------------------------------------------------------------------------------
-- p_lines: [{material_id | description+unit_id, quantity, price, purchase_request_item_id}]
create function public.save_supplier_invoice_draft(
  p_id uuid, p_project_id uuid, p_supplier_id uuid, p_purchase_request_id uuid,
  p_supplier_doc_number text, p_supplier_doc_date date, p_currency text, p_note text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_doc public.supplier_invoices;
begin
  perform private.require(private.can(v_org, p_project_id, 'supplier_invoices.manage'), 'BF_FORBIDDEN', '42501');

  select * into v_doc from public.supplier_invoices where id = p_id for update;
  if found then
    perform private.require(v_doc.organization_id = v_org and v_doc.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'ENTERED', 'BF_DOCUMENT_LOCKED');
    update public.supplier_invoices
       set supplier_id = p_supplier_id, purchase_request_id = p_purchase_request_id,
           supplier_doc_number = trim(p_supplier_doc_number), supplier_doc_date = p_supplier_doc_date,
           currency = coalesce(upper(p_currency), 'TJS'), note = nullif(trim(p_note), '')
     where id = p_id;
    delete from public.supplier_invoice_items where supplier_invoice_id = p_id;
  else
    insert into public.supplier_invoices (id, organization_id, project_id, supplier_id, purchase_request_id,
      supplier_doc_number, supplier_doc_date, currency, note)
    values (p_id, v_org, p_project_id, p_supplier_id, p_purchase_request_id, trim(p_supplier_doc_number),
      p_supplier_doc_date, coalesce(upper(p_currency), 'TJS'), nullif(trim(p_note), ''));
  end if;

  insert into public.supplier_invoice_items (organization_id, project_id, supplier_invoice_id, line_no,
    material_id, description, unit_id, quantity, price, purchase_request_item_id)
  select v_org, p_project_id, p_id, l.ord::int, nullif(l.v ->> 'material_id', '')::uuid,
         nullif(trim(l.v ->> 'description'), ''),
         coalesce((select m.unit_id from public.materials m where m.id = nullif(l.v ->> 'material_id', '')::uuid),
                  nullif(l.v ->> 'unit_id', '')::uuid),
         (l.v ->> 'quantity')::numeric, (l.v ->> 'price')::numeric,
         nullif(l.v ->> 'purchase_request_item_id', '')::uuid
  from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord);

  return p_id;
end $$;

create function private.invoice_transition(
  p_id uuid, p_key uuid, p_operation text, p_from public.supplier_invoice_status[],
  p_to public.supplier_invoice_status, p_comment text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.supplier_invoices;
  v_cached jsonb;
  v_result jsonb;
  v_comment text := p_comment;
begin
  select * into v_doc from public.supplier_invoices where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, p_operation, p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'supplier_invoices.manage'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = any (p_from), 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);

  if p_operation = 'submit_supplier_invoice' then
    perform private.require(exists (select 1 from public.supplier_invoice_items where supplier_invoice_id = p_id),
                            'BF_NO_LINES');
  elsif p_operation = 'confirm_supplier_invoice' then
    perform private.require(v_doc.total_amount > 0, 'BF_ZERO_AMOUNT');
  elsif p_operation = 'cancel_supplier_invoice' then
    v_comment := private.require_comment(p_comment);
    if v_doc.status = 'CONFIRMED' then
      -- Отмена подтверждённой — только без оплат; обязательство отменяется (§6.3).
      perform private.require(not exists (select 1 from public.payables
                                          where source_doc_type = 'SUPPLIER_INVOICE' and source_doc_id = p_id
                                            and paid_amount > 0), 'BF_HAS_PAYMENTS');
    end if;
  end if;

  perform private.begin_posting();
  update public.supplier_invoices
     set status = p_to,
         number = case when p_to = 'UNDER_REVIEW' and number is null
                       then private.next_document_number(organization_id, 'SUPPLIER_INVOICE', doc_date)
                       else number end,
         posted_at = case when p_to = 'UNDER_REVIEW' and posted_at is null then now() else posted_at end,
         posted_by = case when p_to = 'UNDER_REVIEW' and posted_by is null then (select auth.uid()) else posted_by end,
         confirmed_at = case when p_to = 'CONFIRMED' then now() else confirmed_at end,
         confirmed_by = case when p_to = 'CONFIRMED' then (select auth.uid()) else confirmed_by end,
         cancelled_at = case when p_to = 'CANCELLED' then now() else cancelled_at end,
         cancelled_by = case when p_to = 'CANCELLED' then (select auth.uid()) else cancelled_by end,
         cancel_reason = case when p_to = 'CANCELLED' then v_comment else cancel_reason end
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  if p_to = 'CONFIRMED' then
    -- Д-13: подтверждение (сверка) — основание оплаты: обязательство перед поставщиком.
    insert into public.payables (organization_id, project_id, counterparty_kind, supplier_id, source_doc_type,
      source_doc_id, amount, currency)
    values (v_doc.organization_id, v_doc.project_id, 'SUPPLIER', v_doc.supplier_id, 'SUPPLIER_INVOICE', p_id,
      v_doc.total_amount, v_doc.currency);
  elsif p_to = 'CANCELLED' and v_doc.status = 'CONFIRMED' then
    update public.payables set status = 'CANCELLED'
     where source_doc_type = 'SUPPLIER_INVOICE' and source_doc_id = p_id;
  end if;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.submit_supplier_invoice(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.invoice_transition(p_id, p_key, 'submit_supplier_invoice', '{ENTERED}', 'UNDER_REVIEW')
$$;
create function public.return_supplier_invoice(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.invoice_transition(p_id, p_key, 'return_supplier_invoice', '{UNDER_REVIEW}', 'ENTERED')
$$;
create function public.confirm_supplier_invoice(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.invoice_transition(p_id, p_key, 'confirm_supplier_invoice', '{UNDER_REVIEW}', 'CONFIRMED')
$$;
create function public.cancel_supplier_invoice(p_id uuid, p_key uuid, p_reason text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.invoice_transition(p_id, p_key, 'cancel_supplier_invoice',
                                    '{ENTERED,UNDER_REVIEW,CONFIRMED}', 'CANCELLED', p_reason)
$$;

-- -------------------------------------------------------------------------------------
-- 11. Гранты функций
-- -------------------------------------------------------------------------------------
revoke all on function private.recalc_invoice_total(), private.require(boolean, text, text, text),
  private.require_comment(text), private.project_org(uuid), private.recalc_purchase_request(uuid),
  private.request_transition(uuid, uuid, text, public.purchase_request_status[], public.purchase_request_status, text),
  private.invoice_transition(uuid, uuid, text, public.supplier_invoice_status[], public.supplier_invoice_status, text)
  from public, anon, authenticated;

revoke all on function
  public.save_purchase_request_draft(uuid, uuid, date, text, text, jsonb),
  public.issue_purchase_request(uuid, uuid), public.cancel_purchase_request(uuid, uuid, text),
  public.start_purchase_review(uuid, uuid), public.mark_purchase_discrepancy(uuid, uuid, text),
  public.resolve_purchase_discrepancy(uuid, uuid, text), public.close_purchase_request(uuid, uuid),
  public.save_supplier_invoice_draft(uuid, uuid, uuid, uuid, text, date, text, text, jsonb),
  public.submit_supplier_invoice(uuid, uuid), public.return_supplier_invoice(uuid, uuid),
  public.confirm_supplier_invoice(uuid, uuid), public.cancel_supplier_invoice(uuid, uuid, text)
  from public, anon;
grant execute on function
  public.save_purchase_request_draft(uuid, uuid, date, text, text, jsonb),
  public.issue_purchase_request(uuid, uuid), public.cancel_purchase_request(uuid, uuid, text),
  public.start_purchase_review(uuid, uuid), public.mark_purchase_discrepancy(uuid, uuid, text),
  public.resolve_purchase_discrepancy(uuid, uuid, text), public.close_purchase_request(uuid, uuid),
  public.save_supplier_invoice_draft(uuid, uuid, uuid, uuid, text, date, text, text, jsonb),
  public.submit_supplier_invoice(uuid, uuid), public.return_supplier_invoice(uuid, uuid),
  public.confirm_supplier_invoice(uuid, uuid), public.cancel_supplier_invoice(uuid, uuid, text)
  to authenticated;

-- ROLLBACK:
--   drop view public.supplier_invoice_items_priced, public.supplier_invoices_priced,
--     public.purchase_request_items_priced;
--   drop table public.supplier_invoice_items, public.supplier_invoices, public.purchase_request_items,
--     public.purchase_requests cascade;
--   drop function (все функции этого файла);
--   drop type public.supplier_invoice_status, public.purchase_request_status;
