-- Правки по прогону пилота 26.10.2026:
-- 1) «Выдать» с телефона — с этапом работ (Д-100): иначе выдача не попадает в нормативы
--    (норматив — материал + блок + этап).
-- 2) Накладная может ссылаться на заявку склада (BP-01: бухгалтер сверяет накладные с приёмками
--    по заявке) — необязательно; ссылку видно в карточке заявки.
-- 3) Отчёт долгов: у долга из «Ввода остатков» — номер и дата документа (обязательство ссылается
--    на строку ввода, а не на документ).
-- Меняются только функции; данные не трогаются.

-- -------------------------------------------------------------------------------------
-- 1. Выдача: этап работ
-- -------------------------------------------------------------------------------------
drop function public.save_material_issue_draft(uuid, uuid, uuid, uuid, uuid, text, text, jsonb);

create function public.save_material_issue_draft(
  p_id uuid, p_project_id uuid, p_block_id uuid, p_floor_id uuid, p_crew_id uuid, p_received_by_name text,
  p_note text, p_lines jsonb, p_stage_id uuid default null
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
       set block_id = p_block_id, floor_id = p_floor_id, stage_id = p_stage_id, crew_id = p_crew_id,
           received_by_name = nullif(trim(p_received_by_name), ''), note = nullif(trim(p_note), '')
     where id = p_id;
    delete from public.material_issue_items where material_issue_id = p_id;
  else
    insert into public.material_issues (id, organization_id, project_id, block_id, floor_id, stage_id, crew_id,
      received_by_name, note)
    values (p_id, v_org, p_project_id, p_block_id, p_floor_id, p_stage_id, p_crew_id,
      nullif(trim(p_received_by_name), ''), nullif(trim(p_note), ''));
  end if;

  insert into public.material_issue_items (organization_id, project_id, material_issue_id, line_no, material_id,
    unit_id, quantity)
  select v_org, p_project_id, p_id, l.ord::int, (l.v ->> 'material_id')::uuid, gen_random_uuid(),
         (l.v ->> 'quantity')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord)
  where coalesce((l.v ->> 'quantity')::numeric, 0) > 0;

  return p_id;
end $$;

revoke all on function public.save_material_issue_draft(uuid, uuid, uuid, uuid, uuid, text, text, jsonb, uuid)
  from public, anon;
grant execute on function public.save_material_issue_draft(uuid, uuid, uuid, uuid, uuid, text, text, jsonb, uuid)
  to authenticated;

-- -------------------------------------------------------------------------------------
-- 2. Накладная: необязательная ссылка на заявку склада
-- -------------------------------------------------------------------------------------
drop function public.save_supplier_invoice(uuid, uuid, uuid, uuid, date, text, text, text, jsonb);

create function public.save_supplier_invoice(
  p_id uuid, p_key uuid, p_project_id uuid, p_supplier_id uuid, p_doc_date date, p_doc_number text,
  p_currency text, p_note text, p_lines jsonb, p_purchase_request_id uuid default null
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
  v_request_status text;
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

  -- Заявка — этого объекта и в работе: выданная, принимаемая или на сверке (не черновик, не закрытая).
  -- Уже привязанную к накладной заявку можно оставить при исправлении, даже если её закрыли.
  if p_purchase_request_id is not null
     and p_purchase_request_id is distinct from (case when v_new then null else v_doc.purchase_request_id end) then
    select status::text into v_request_status from public.purchase_requests
     where id = p_purchase_request_id and organization_id = v_org and project_id = p_project_id;
    perform private.require(v_request_status is not null, 'BF_NOT_FOUND', 'P0002');
    perform private.require(v_request_status in ('ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED',
                                                 'ACCOUNTING_REVIEW', 'DISCREPANCY'),
                            'BF_INVALID_STATUS', 'P0001', v_request_status);
  end if;

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
           currency = v_currency, note = nullif(trim(p_note), ''), purchase_request_id = p_purchase_request_id
     where id = p_id;
    delete from public.supplier_invoice_items where supplier_invoice_id = p_id;
  else
    insert into public.supplier_invoices (id, organization_id, project_id, supplier_id, purchase_request_id,
      doc_date, supplier_doc_number, supplier_doc_date, currency, note)
    values (p_id, v_org, p_project_id, p_supplier_id, p_purchase_request_id, p_doc_date, v_doc_number,
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

revoke all on function public.save_supplier_invoice(uuid, uuid, uuid, uuid, date, text, text, text, jsonb, uuid)
  from public, anon;
grant execute on function public.save_supplier_invoice(uuid, uuid, uuid, uuid, date, text, text, text, jsonb, uuid)
  to authenticated;

-- -------------------------------------------------------------------------------------
-- 3. Отчёт долгов: документ «Ввод остатков» — через его строку
-- -------------------------------------------------------------------------------------
create or replace function public.report_payables(
  p_org uuid, p_kind public.payable_counterparty default null, p_project uuid default null,
  p_open_only boolean default false
)
returns table (payable_id uuid, counterparty_kind public.payable_counterparty, counterparty_name text,
               project_code text, source_doc_type public.document_type, source_number text, doc_date date,
               amount numeric, paid numeric, remaining numeric, currency text, status public.payable_status,
               last_payment_date date)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.has_permission(p_org, 'payables.view') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  return query
    select x.id, x.counterparty_kind, coalesce(s.name, c.name), p.code, x.source_doc_type,
           coalesce(inv.number, act.number, ob.number), coalesce(inv.doc_date, act.doc_date, ob.doc_date),
           x.amount, x.paid_amount, x.amount - x.paid_amount, x.currency::text, x.status,
           (select max(pm.doc_date) from public.payments pm where pm.payable_id = x.id)
    from public.payables x
    left join public.suppliers s on s.id = x.supplier_id
    left join public.crews c on c.id = x.crew_id
    left join public.projects p on p.id = x.project_id
    left join public.supplier_invoices inv on x.source_doc_type = 'SUPPLIER_INVOICE' and inv.id = x.source_doc_id
    left join public.work_completion_acts act on x.source_doc_type = 'WORK_ACT' and act.id = x.source_doc_id
    left join public.opening_payable_items obi on x.source_doc_type = 'OPENING_BALANCE' and obi.id = x.source_doc_id
    left join public.opening_balances ob on ob.id = obi.opening_balance_id
    where x.organization_id = p_org and x.status <> 'CANCELLED'
      and (p_kind is null or x.counterparty_kind = p_kind)
      and (p_project is null or x.project_id = p_project)
      and (not p_open_only or x.amount > x.paid_amount)
    order by 3, 7, 6;
end $$;

-- ROLLBACK:
--   report_payables — вернуть версию из 20261017000200_reports.sql;
--   drop function public.save_material_issue_draft(uuid, uuid, uuid, uuid, uuid, text, text, jsonb, uuid);
--   drop function public.save_supplier_invoice(uuid, uuid, uuid, uuid, date, text, text, text, jsonb, uuid);
--   и вернуть прежние версии из 20261014000200_warehouse.sql и 20261024000000_invoice_sheet.sql.
