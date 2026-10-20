-- =====================================================================================
-- 0020 Д-97 (интервью с материальным бухгалтером 20.10.2026, решения владельца): «Накладные» —
-- это журнал затрат, как таблица Excel: строка = дата, наименование, категория, кол-во, ед., цена,
-- валюта, сумма, поставщик. Одна строка = одна запись (накладная из одной строки) со своим долгом;
-- долг поставщику — сразу при вводе (без шага проверки). Править строку можно, пока по ней нет
-- оплаты (контролируемая корректировка, всё в audit_logs); после оплаты — только отмена.
-- Категории — справочник (название, цвет, «через склад»). Связь со складом не проверяется
-- (свободный ввод; TODO(TZ-open): автосверка затрат складских категорий с приёмками).
-- Без DROP: старые многострочные накладные остаются как есть.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Справочник категорий затрат
-- -------------------------------------------------------------------------------------
create table public.expense_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name            text not null check (length(trim(name)) > 0),
  -- Ключ цвета из фиксированной палитры интерфейса (features/catalog/expense-colors.ts).
  color           text not null default 'gray'
                  check (color in ('violet', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'gray')),
  -- Конструктив, продукты, инвентарь сначала принимает склад; прочие расходы и транспорт — нет.
  via_warehouse   boolean not null default false,
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);
create index on public.expense_categories (organization_id, sort_order);

create trigger set_created_by before insert on public.expense_categories
  for each row execute function private.set_created_by();
create trigger before_update_std before update on public.expense_categories
  for each row execute function private.before_update_std();
create trigger audit after insert or update or delete on public.expense_categories
  for each row execute function private.audit_row();

alter table public.expense_categories enable row level security;
-- Справочник: читают все участники организации; правит catalog.manage (как материалы, Д-31).
create policy expense_categories_select on public.expense_categories for select to authenticated
  using (private.is_member(organization_id));
create policy expense_categories_insert on public.expense_categories for insert to authenticated
  with check (private.has_permission(organization_id, 'catalog.manage'));
create policy expense_categories_update on public.expense_categories for update to authenticated
  using (private.has_permission(organization_id, 'catalog.manage'))
  with check (private.has_permission(organization_id, 'catalog.manage'));

revoke all on public.expense_categories from anon, authenticated;
grant select, insert on public.expense_categories to authenticated;
grant update (name, color, via_warehouse, sort_order, is_active) on public.expense_categories to authenticated;
grant select, insert, update, delete on public.expense_categories to service_role;

-- Стартовые категории (Д-97): существующим организациям и каждой новой.
create function private.seed_expense_categories(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.expense_categories (organization_id, name, color, via_warehouse, sort_order)
  values (p_org, 'Конструктив', 'blue', true, 10), (p_org, 'Продукты', 'green', true, 20),
         (p_org, 'Инвентарь', 'violet', true, 30), (p_org, 'Прочие расходы', 'amber', false, 40),
         (p_org, 'Транспортировка', 'teal', false, 50)
  on conflict (organization_id, name) do nothing
$$;

select private.seed_expense_categories(id) from public.organizations;

create function private.on_organization_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_expense_categories(new.id);
  return null;
end $$;
create trigger seed_expense_categories after insert on public.organizations
  for each row execute function private.on_organization_created();

revoke all on function private.seed_expense_categories(uuid), private.on_organization_created()
  from public, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 2. Строка затрат = накладная из одной строки
-- -------------------------------------------------------------------------------------
alter table public.supplier_invoices
  add column category_id uuid,
  add foreign key (category_id, organization_id) references public.expense_categories (id, organization_id);
create index on public.supplier_invoices (category_id);
-- № и дата бумажной накладной — необязательны (в журнале затрат их обычно нет). Уникальный индекс
-- supplier_invoices_supplier_doc_key при NULL номера не срабатывает — повтор без номера возможен.
alter table public.supplier_invoices
  alter column supplier_doc_number drop not null,
  alter column supplier_doc_date drop not null;

grant select (category_id) on public.supplier_invoices to authenticated;

-- Переходы для строки затрат (только из функций проведения): сразу «подтверждена» и временный
-- возврат в «введена» для корректировки неоплаченной строки (внутри одной транзакции).
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
    -- Строка затрат (Д-97): долг сразу при вводе; корректировка неоплаченной строки.
    ('supplier_invoices', 'ENTERED', 'CONFIRMED'), ('supplier_invoices', 'CONFIRMED', 'ENTERED'),
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
    ('work_completion_acts', 'DRAFT', 'REVIEW'), ('work_completion_acts', 'REVIEW', 'APPROVED'),
    ('work_completion_acts', 'REVIEW', 'REJECTED'), ('work_completion_acts', 'DRAFT', 'CANCELLED'),
    ('work_completion_acts', 'REVIEW', 'CANCELLED'), ('work_completion_acts', 'APPROVED', 'CANCELLED'),
    ('tasks', 'NEW', 'IN_PROGRESS'), ('tasks', 'IN_PROGRESS', 'ON_REVIEW'),
    ('tasks', 'ON_REVIEW', 'DONE'), ('tasks', 'ON_REVIEW', 'IN_PROGRESS'),
    ('tasks', 'NEW', 'BLOCKED'), ('tasks', 'IN_PROGRESS', 'BLOCKED'), ('tasks', 'BLOCKED', 'IN_PROGRESS'),
    ('tasks', 'NEW', 'CANCELLED'), ('tasks', 'IN_PROGRESS', 'CANCELLED'),
    ('tasks', 'BLOCKED', 'CANCELLED'), ('tasks', 'ON_REVIEW', 'CANCELLED')
  )
$$;

-- -------------------------------------------------------------------------------------
-- 3. Ввод и корректировка строки затрат — одной транзакцией, идемпотентно (id от клиента + ключ)
-- -------------------------------------------------------------------------------------
create function public.save_expense_row(
  p_id uuid, p_key uuid, p_project_id uuid, p_doc_date date, p_category_id uuid, p_supplier_id uuid,
  p_description text, p_material_id uuid, p_unit_id uuid, p_quantity numeric, p_price numeric,
  p_currency text, p_doc_number text, p_note text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_doc public.supplier_invoices;
  v_pay public.payables;
  v_cached jsonb;
  v_result jsonb;
  v_unit uuid;
  v_doc_number text := nullif(trim(p_doc_number), '');
  v_currency text := coalesce(upper(nullif(trim(p_currency), '')), 'TJS');
begin
  perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_org, p_project_id, 'supplier_invoices.manage'), 'BF_FORBIDDEN', '42501');
  v_cached := private.idempotency_begin(v_org, p_key, 'save_expense_row', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(nullif(trim(p_description), '') is not null or p_material_id is not null,
                          'BF_NO_DESCRIPTION');
  perform private.require(p_category_id is not null and p_doc_date is not null, 'BF_REQUIRED_FIELDS');
  -- Единица материала — его базовая (Д-21); у свободного наименования — из строки.
  v_unit := coalesce((select m.unit_id from public.materials m
                      where m.id = p_material_id and m.organization_id = v_org), p_unit_id);

  select * into v_doc from public.supplier_invoices where id = p_id for update;
  if found then
    -- Корректировка: только своя строка затрат без оплат (иначе — отмена, §6.3).
    perform private.require(v_doc.organization_id = v_org and v_doc.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'CONFIRMED', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
    perform private.require((select count(*) from public.supplier_invoice_items
                             where supplier_invoice_id = p_id) = 1, 'BF_DOCUMENT_LOCKED');
    select * into v_pay from public.payables
     where source_doc_type = 'SUPPLIER_INVOICE' and source_doc_id = p_id for update;
    perform private.require(coalesce(v_pay.paid_amount, 0) = 0, 'BF_HAS_PAYMENTS');

    perform private.begin_posting();
    update public.supplier_invoices set status = 'ENTERED' where id = p_id;
    update public.supplier_invoices
       set doc_date = p_doc_date, category_id = p_category_id, supplier_id = p_supplier_id,
           supplier_doc_number = v_doc_number,
           supplier_doc_date = case when v_doc_number is null then null else p_doc_date end,
           currency = v_currency, note = nullif(trim(p_note), '')
     where id = p_id;
    update public.supplier_invoice_items
       set material_id = p_material_id, description = nullif(trim(p_description), ''), unit_id = v_unit,
           quantity = p_quantity, price = p_price
     where supplier_invoice_id = p_id;
    update public.supplier_invoices set status = 'CONFIRMED' where id = p_id returning * into v_doc;
    perform private.require(v_doc.total_amount > 0, 'BF_ZERO_AMOUNT');
    update public.payables
       set supplier_id = v_doc.supplier_id, amount = v_doc.total_amount, currency = v_doc.currency
     where id = v_pay.id;
  else
    insert into public.supplier_invoices (id, organization_id, project_id, supplier_id, doc_date, category_id,
      supplier_doc_number, supplier_doc_date, currency, note)
    values (p_id, v_org, p_project_id, p_supplier_id, p_doc_date, p_category_id, v_doc_number,
      case when v_doc_number is null then null else p_doc_date end, v_currency, nullif(trim(p_note), ''));
    insert into public.supplier_invoice_items (organization_id, project_id, supplier_invoice_id, line_no,
      material_id, description, unit_id, quantity, price)
    values (v_org, p_project_id, p_id, 1, p_material_id, nullif(trim(p_description), ''), v_unit,
      p_quantity, p_price);

    perform private.begin_posting();
    update public.supplier_invoices
       set status = 'CONFIRMED',
           number = private.next_document_number(organization_id, 'SUPPLIER_INVOICE', doc_date),
           posted_at = now(), posted_by = (select auth.uid()),
           confirmed_at = now(), confirmed_by = (select auth.uid())
     where id = p_id
    returning * into v_doc;
    perform private.require(v_doc.total_amount > 0, 'BF_ZERO_AMOUNT');
    -- Д-13, Д-97: строка затрат сразу — основание оплаты (обязательство перед поставщиком).
    insert into public.payables (organization_id, project_id, counterparty_kind, supplier_id, source_doc_type,
      source_doc_id, amount, currency)
    values (v_org, p_project_id, 'SUPPLIER', v_doc.supplier_id, 'SUPPLIER_INVOICE', p_id,
      v_doc.total_amount, v_doc.currency);
  end if;

  v_result := jsonb_build_object('id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status,
                                 'amount', v_doc.total_amount);
  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

revoke all on function public.save_expense_row(uuid, uuid, uuid, date, uuid, uuid, text, uuid, uuid, numeric,
  numeric, text, text, text) from public, anon;
grant execute on function public.save_expense_row(uuid, uuid, uuid, date, uuid, uuid, text, uuid, uuid, numeric,
  numeric, text, text, text) to authenticated;

-- ROLLBACK:
--   drop function public.save_expense_row(...); вернуть private.allowed_transition из
--   20261017000000_crews_work_acts.sql; drop trigger seed_expense_categories on public.organizations;
--   drop function private.on_organization_created(), private.seed_expense_categories(uuid);
--   alter table public.supplier_invoices drop column category_id (только после «да» владельца —
--   деструктивно); вернуть NOT NULL номеру и дате накладной (если нет строк без них);
--   drop table public.expense_categories.
