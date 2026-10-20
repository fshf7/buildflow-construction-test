-- =====================================================================================
-- 0021 Д-99 (пилот 20.10.2026, решения владельца; пересматривает Д-97): бухгалтер оформляет
-- накладную из многих строк, как в Excel: в шапке — поставщик, дата, № бумажной накладной
-- (необяз.), валюта; категория — у каждой строки. При сохранении — номер НК и сразу долг
-- поставщику на всю сумму. Исправлять можно, пока по накладной нет оплаты (номер сохраняется,
-- долг пересчитывается, изменения — в audit_logs); после оплаты — только отмена.
-- «Затраты» — просмотр строк всех накладных. save_expense_row (Д-97) приложением больше не
-- вызывается; функция остаётся (удаление — отдельно, после «да» владельца).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Категория — у строки накладной
-- -------------------------------------------------------------------------------------
alter table public.supplier_invoice_items
  add column category_id uuid,
  add foreign key (category_id, organization_id) references public.expense_categories (id, organization_id);
create index on public.supplier_invoice_items (category_id);
grant select (category_id) on public.supplier_invoice_items to authenticated;

-- Строки затрат Д-97: категория была у накладной из одной строки — переносим в строку.
-- Строки меняются в обход guard_lines (миграция — владелец таблицы, триггер отключаем на время).
alter table public.supplier_invoice_items disable trigger guard_lines;
update public.supplier_invoice_items i
   set category_id = v.category_id
  from public.supplier_invoices v
 where v.id = i.supplier_invoice_id and v.category_id is not null and i.category_id is null;
alter table public.supplier_invoice_items enable trigger guard_lines;

-- Витрина с ценами — с категорией строки (журнал затрат читает строки целиком).
create or replace view public.supplier_invoice_items_priced with (security_barrier = true) as
  select i.id, i.organization_id, i.project_id, i.supplier_invoice_id, i.line_no, i.material_id, i.description,
         i.unit_id, i.quantity, i.price, i.amount, i.purchase_request_item_id, i.category_id
  from public.supplier_invoice_items i
  where private.can(i.organization_id, i.project_id, 'supplier_invoices.view')
    and private.can(i.organization_id, i.project_id, 'prices.view');

-- -------------------------------------------------------------------------------------
-- 2. Сохранение накладной целиком — одной транзакцией, идемпотентно (id от клиента + ключ)
-- p_lines: [{description, material_id, category_id, unit_id, quantity, price}]
-- -------------------------------------------------------------------------------------
create function public.save_supplier_invoice(
  p_id uuid, p_key uuid, p_project_id uuid, p_supplier_id uuid, p_doc_date date, p_doc_number text,
  p_currency text, p_note text, p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_doc public.supplier_invoices;
  v_pay public.payables;
  v_cached jsonb;
  v_result jsonb;
  v_doc_number text := nullif(trim(p_doc_number), '');
  v_currency text := coalesce(upper(nullif(trim(p_currency), '')), 'TJS');
  v_new boolean;
begin
  perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_org, p_project_id, 'supplier_invoices.manage'), 'BF_FORBIDDEN', '42501');
  v_cached := private.idempotency_begin(v_org, p_key, 'save_supplier_invoice', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(p_doc_date is not null and p_supplier_id is not null, 'BF_REQUIRED_FIELDS');
  perform private.require(jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0, 'BF_NO_LINES');
  perform private.require(not exists (
    select 1 from jsonb_array_elements(p_lines) l
    where nullif(trim(l ->> 'description'), '') is null and nullif(l ->> 'material_id', '') is null
  ), 'BF_NO_DESCRIPTION');
  perform private.require(not exists (
    select 1 from jsonb_array_elements(p_lines) l where nullif(l ->> 'category_id', '') is null
  ), 'BF_REQUIRED_FIELDS');

  select * into v_doc from public.supplier_invoices where id = p_id for update;
  v_new := not found;
  if not v_new then
    -- Исправление: своя накладная, не отменена, без оплат (иначе — отмена, §6.3).
    perform private.require(v_doc.organization_id = v_org and v_doc.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status <> 'CANCELLED', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
    select * into v_pay from public.payables
     where source_doc_type = 'SUPPLIER_INVOICE' and source_doc_id = p_id for update;
    perform private.require(coalesce(v_pay.paid_amount, 0) = 0, 'BF_HAS_PAYMENTS');

    perform private.begin_posting();
    if v_doc.status <> 'ENTERED' then
      update public.supplier_invoices set status = 'ENTERED' where id = p_id;
    end if;
    update public.supplier_invoices
       set supplier_id = p_supplier_id, doc_date = p_doc_date, supplier_doc_number = v_doc_number,
           supplier_doc_date = case when v_doc_number is null then null else p_doc_date end,
           currency = v_currency, note = nullif(trim(p_note), '')
     where id = p_id;
    delete from public.supplier_invoice_items where supplier_invoice_id = p_id;
  else
    insert into public.supplier_invoices (id, organization_id, project_id, supplier_id, doc_date,
      supplier_doc_number, supplier_doc_date, currency, note)
    values (p_id, v_org, p_project_id, p_supplier_id, p_doc_date, v_doc_number,
      case when v_doc_number is null then null else p_doc_date end, v_currency, nullif(trim(p_note), ''));
  end if;

  -- Единица материала — его базовая (Д-21, триггер set_line_unit); у свободного наименования — из строки.
  insert into public.supplier_invoice_items (organization_id, project_id, supplier_invoice_id, line_no,
    material_id, description, category_id, unit_id, quantity, price)
  select v_org, p_project_id, p_id, l.ord::int, nullif(l.v ->> 'material_id', '')::uuid,
         nullif(trim(l.v ->> 'description'), ''), (l.v ->> 'category_id')::uuid,
         coalesce((select m.unit_id from public.materials m
                   where m.id = nullif(l.v ->> 'material_id', '')::uuid and m.organization_id = v_org),
                  nullif(l.v ->> 'unit_id', '')::uuid),
         (l.v ->> 'quantity')::numeric, (l.v ->> 'price')::numeric
  from jsonb_array_elements(p_lines) with ordinality as l(v, ord);

  perform private.begin_posting();
  update public.supplier_invoices
     set status = 'CONFIRMED',
         number = coalesce(number, private.next_document_number(organization_id, 'SUPPLIER_INVOICE', doc_date)),
         posted_at = coalesce(posted_at, now()), posted_by = coalesce(posted_by, (select auth.uid())),
         confirmed_at = now(), confirmed_by = (select auth.uid())
   where id = p_id
  returning * into v_doc;
  perform private.require(v_doc.total_amount > 0, 'BF_ZERO_AMOUNT');

  -- Д-13, Д-99: сохранённая накладная — сразу основание оплаты (обязательство перед поставщиком).
  if v_pay.id is null then
    insert into public.payables (organization_id, project_id, counterparty_kind, supplier_id, source_doc_type,
      source_doc_id, amount, currency)
    values (v_org, p_project_id, 'SUPPLIER', v_doc.supplier_id, 'SUPPLIER_INVOICE', p_id,
      v_doc.total_amount, v_doc.currency);
  else
    update public.payables
       set supplier_id = v_doc.supplier_id, amount = v_doc.total_amount, currency = v_doc.currency,
           status = 'OPEN'
     where id = v_pay.id;
  end if;

  v_result := jsonb_build_object('id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status,
                                 'amount', v_doc.total_amount);
  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

revoke all on function public.save_supplier_invoice(uuid, uuid, uuid, uuid, date, text, text, text, jsonb)
  from public, anon;
grant execute on function public.save_supplier_invoice(uuid, uuid, uuid, uuid, date, text, text, text, jsonb)
  to authenticated;

-- ROLLBACK:
--   drop function public.save_supplier_invoice(uuid, uuid, uuid, uuid, date, text, text, text, jsonb);
--   вернуть view supplier_invoice_items_priced из 20261014000100_procurement.sql;
--   alter table public.supplier_invoice_items drop column category_id — деструктивно, только после «да».
