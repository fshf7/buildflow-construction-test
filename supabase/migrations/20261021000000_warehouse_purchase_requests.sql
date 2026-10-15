-- =====================================================================================
-- 0018 Д-92 (решение владельца 15.10.2026): заявку для снабженца оформляет заведующий складом.
-- В заявке — только материалы и количества: поставщика выбирает склад при приёмке, цены вносит
-- материальный бухгалтер из накладной. Бухгалтер заявки не оформляет — ведёт сверку, расхождение
-- и закрытие (новое право purchase_requests.review).
-- Колонки purchase_request_items.supplier_id / price / amount не удаляются (на staging есть
-- данные; DROP — только после явного «да» владельца): новые заявки оставляют их пустыми.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Права: purchase_requests.manage — складу, purchase_requests.review — бухгалтеру.
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
-- У бухгалтера больше нет права оформлять заявки.
delete from public.permissions p using public.roles r
where p.role_id = r.id and r.code = 'accountant' and p.code = 'purchase_requests.manage';

-- -------------------------------------------------------------------------------------
-- 2. Черновик заявки: без поставщика и цены.
-- -------------------------------------------------------------------------------------
create or replace function public.save_purchase_request_draft(
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

  -- Д-92: поставщик и цена в заявке не задаются (supplier_id, price остаются NULL; ключи из p_lines
  -- игнорируются). Поставщика выбирает склад при приёмке, цены вносит бухгалтер из накладной.
  insert into public.purchase_request_items (organization_id, project_id, purchase_request_id, line_no,
    material_id, unit_id, quantity, note)
  select v_org, p_project_id, p_id, l.ord::int, (l.v ->> 'material_id')::uuid,
         (select m.unit_id from public.materials m where m.id = (l.v ->> 'material_id')::uuid),
         (l.v ->> 'quantity')::numeric, nullif(trim(l.v ->> 'note'), '')
  from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord);

  return p_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 3. Переходы заявки: право зависит от операции; выпуск больше не требует поставщика и цены.
-- -------------------------------------------------------------------------------------
create or replace function private.request_transition(
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

  -- Д-92: оформление (выпуск, отмена) — склад; сверка, расхождение, закрытие — бухгалтер.
  perform private.require(private.can(v_doc.organization_id, v_doc.project_id,
                            case when p_operation in ('issue_purchase_request', 'cancel_purchase_request')
                                 then 'purchase_requests.manage' else 'purchase_requests.review' end),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = any (p_from), 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);

  if p_operation = 'issue_purchase_request' then
    perform private.require(exists (select 1 from public.purchase_request_items where purchase_request_id = p_id),
                            'BF_NO_LINES');
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

-- -------------------------------------------------------------------------------------
-- 4. Проведение приёмки: строки заявки не сверяются с поставщиком приёмки.
-- -------------------------------------------------------------------------------------
create or replace function private.apply_goods_receipt(p_doc public.goods_receipts) returns jsonb
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
    -- Строки заявки — только этой заявки. Поставщика выбирает склад при приёмке (Д-92), в заявке его нет.
    perform private.require(not exists (
      select 1 from public.goods_receipt_items gi
      join public.purchase_request_items i on i.id = gi.purchase_request_item_id
      where gi.goods_receipt_id = p_doc.id and i.purchase_request_id <> p_doc.purchase_request_id
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

-- ROLLBACK:
--   вернуть private.permission_catalog из 20261017000000_crews_work_acts.sql;
--   вернуть public.save_purchase_request_draft и private.request_transition из
--   20261014000100_procurement.sql, private.apply_goods_receipt из 20261014000200_warehouse.sql;
--   delete from public.permissions p using public.roles r where p.role_id = r.id and
--     ((r.code = 'warehouse' and p.code = 'purchase_requests.manage') or p.code = 'purchase_requests.review');
--   вернуть бухгалтеру purchase_requests.manage (insert … from private.permission_catalog()).
