-- Д-112: сверка услуг бухгалтером — «по услуге за период».
-- Строка накладной может быть услугой из справочника (service_id). Отчёт сверки по объекту и
-- периоду: использовано (журнал склада, действующие строки по дате), по согласованным заявкам
-- (план), в накладных (не отменённые, по дате накладной: количество и сумма), разница.
-- Только показывает расхождение, ничего не блокирует.
-- TODO(TZ-open): что делать при расхождении (кто решает, корректировка счёта или журнала).

-- -------------------------------------------------------------------------------------
-- 1. Услуга в строке накладной
-- -------------------------------------------------------------------------------------
alter table public.supplier_invoice_items
  add column service_id uuid,
  add foreign key (service_id, organization_id) references public.services (id, organization_id),
  add check (material_id is null or service_id is null);
create index on public.supplier_invoice_items (service_id);
grant select (service_id) on public.supplier_invoice_items to authenticated;

-- Витрина с ценами — с услугой строки (новая колонка — в конце).
create or replace view public.supplier_invoice_items_priced with (security_barrier = true) as
  select i.id, i.organization_id, i.project_id, i.supplier_invoice_id, i.line_no, i.material_id, i.description,
         i.unit_id, i.quantity, i.price, i.amount, i.purchase_request_item_id, i.category_id, i.service_id
  from public.supplier_invoice_items i
  where private.can(i.organization_id, i.project_id, 'supplier_invoices.view')
    and private.can(i.organization_id, i.project_id, 'prices.view');

-- -------------------------------------------------------------------------------------
-- 2. Сохранение накладной: строки с service_id (сигнатура прежняя, p_lines: + service_id)
-- -------------------------------------------------------------------------------------
create or replace function public.save_supplier_invoice(
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
  -- Д-112: строка может быть услугой из справочника (для сверки с журналом услуг склада);
  -- единица — услуги, как у материала — его базовая.
  insert into public.supplier_invoice_items (organization_id, project_id, supplier_invoice_id, line_no,
    material_id, service_id, description, category_id, unit_id, quantity, price)
  select v_org, p_project_id, p_id, l.ord::int, nullif(l.v ->> 'material_id', '')::uuid,
         case when nullif(l.v ->> 'material_id', '') is null then nullif(l.v ->> 'service_id', '')::uuid end,
         nullif(trim(l.v ->> 'description'), ''), (l.v ->> 'category_id')::uuid,
         coalesce((select m.unit_id from public.materials m
                   where m.id = nullif(l.v ->> 'material_id', '')::uuid and m.organization_id = v_org),
                  (select s.unit_id from public.services s
                   where s.id = nullif(l.v ->> 'service_id', '')::uuid and s.organization_id = v_org),
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

-- -------------------------------------------------------------------------------------
-- 3. Сверка услуг за период (security invoker: суммы — из витрины с ценами, prices.view)
-- -------------------------------------------------------------------------------------
create function public.report_service_reconciliation(p_project uuid, p_from date, p_to date)
returns table (service_id uuid, service text, unit text, used numeric, used_rows int, requested numeric,
               invoiced numeric, invoiced_amount numeric, currencies text[], invoices int)
language sql stable security invoker set search_path = '' as $$
  with used as (
    select u.service_id, sum(u.quantity) as q, count(*) as n
    from public.service_usages u
    where u.project_id = p_project and u.status = 'ACTIVE' and u.doc_date between p_from and p_to
    group by u.service_id
  ), req as (
    -- План — по согласованным и выполненным заявкам, по дате «когда нужно» (или дате заявки).
    select r.service_id, sum(r.quantity) as q
    from public.service_requests r
    where r.project_id = p_project and r.status in ('APPROVED', 'DONE')
      and coalesce(r.planned_date, r.doc_date) between p_from and p_to
    group by r.service_id
  ), inv as (
    select i.service_id, sum(i.quantity) as q, sum(i.amount) as a,
           array_agg(distinct v.currency) as cur, count(distinct v.id) as n
    from public.supplier_invoice_items_priced i
    join public.supplier_invoices v on v.id = i.supplier_invoice_id
    where i.project_id = p_project and i.service_id is not null and v.status <> 'CANCELLED'
      and v.doc_date between p_from and p_to
    group by i.service_id
  ), ids as (
    select used.service_id from used union select req.service_id from req union select inv.service_id from inv
  )
  select s.id, s.name, uom.code, coalesce(used.q, 0), coalesce(used.n, 0)::int, coalesce(req.q, 0),
         coalesce(inv.q, 0), coalesce(inv.a, 0), coalesce(inv.cur, '{}'), coalesce(inv.n, 0)::int
  from ids
  join public.services s on s.id = ids.service_id
  join public.units_of_measure uom on uom.id = s.unit_id
  left join used on used.service_id = ids.service_id
  left join req on req.service_id = ids.service_id
  left join inv on inv.service_id = ids.service_id
  order by s.name
$$;

revoke all on function public.report_service_reconciliation(uuid, date, date) from public, anon;
grant execute on function public.report_service_reconciliation(uuid, date, date) to authenticated;

-- ROLLBACK: drop function public.report_service_reconciliation(uuid, date, date);
--   save_supplier_invoice — версия из 20261026000000; витрина — из 20261024000000 (без service_id:
--   drop view + create); alter table supplier_invoice_items drop column service_id.
