-- Д-109: строку «Прихода», «Расхода», «Услуг» старше 7 дней исправляет бухгалтер.
-- Было: подсказка «исправит бухгалтер», но у бухгалтера нет goods_receipts.post / material_issues.post,
-- а вложенные post/reverse_material_issue проверяли material_issues.post — исправить не мог никто.
-- Теперь: новая строка — только склад; исправление существующей — склад в пределах 7 дней
-- (private.can_fix_stock_row) или бухгалтер (goods_receipts.approve_correction) в любой срок.
-- TODO(TZ-open): срок 7 дней для склада.
-- Проведение и сторно выдачи: проверка прав — в публичной функции, тело — private.*_core
-- (вызывается из строк таблиц после своей проверки прав). Только функции, данные не меняются.

-- -------------------------------------------------------------------------------------
-- 1. Выдача: тело без проверки прав
-- -------------------------------------------------------------------------------------
create function private.post_material_issue_core(p_id uuid, p_key uuid) returns jsonb
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

create function private.reverse_material_issue_core(p_id uuid, p_key uuid, p_reason text) returns jsonb
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

create or replace function public.post_material_issue(p_id uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.material_issues;
begin
  select * into v_doc from public.material_issues where id = p_id;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'material_issues.post'),
                          'BF_FORBIDDEN', '42501');
  return private.post_material_issue_core(p_id, p_key);
end $$;

create or replace function public.reverse_material_issue(p_id uuid, p_key uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.material_issues;
begin
  select * into v_doc from public.material_issues where id = p_id;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'material_issues.post'),
                          'BF_FORBIDDEN', '42501');
  return private.reverse_material_issue_core(p_id, p_key, p_reason);
end $$;

revoke all on function private.post_material_issue_core(uuid, uuid),
  private.reverse_material_issue_core(uuid, uuid, text) from public, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 2. Строки таблиц склада
-- -------------------------------------------------------------------------------------
create or replace function public.save_receipt_row(
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
  -- Новая строка — склад (goods_receipts.post); исправление — склад в пределах 7 дней или
  -- бухгалтер (goods_receipts.approve_correction) в любой срок (Д-109).
  perform private.require(private.can(v_org, p_project_id, 'goods_receipts.post')
                          or private.can(v_org, p_project_id, 'goods_receipts.approve_correction'),
                          'BF_FORBIDDEN', '42501');
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
    perform private.require(private.can(v_org, p_project_id, 'goods_receipts.post'), 'BF_FORBIDDEN', '42501');
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

create or replace function public.save_issue_row(
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
  -- Новая строка — склад; исправление — склад в пределах 7 дней или бухгалтер (Д-109).
  perform private.require(private.can(v_org, p_project_id, 'material_issues.post')
                          or private.can(v_org, p_project_id, 'goods_receipts.approve_correction'),
                          'BF_FORBIDDEN', '42501');
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
    perform private.reverse_material_issue_core(p_id, gen_random_uuid(), 'Исправление строки');
    v_new := gen_random_uuid();
  else
    perform private.require(private.can(v_org, p_project_id, 'material_issues.post'), 'BF_FORBIDDEN', '42501');
  end if;

  insert into public.material_issues (id, organization_id, project_id, doc_date, block_id, floor_id, stage_id,
    crew_id, replaces_issue_id)
  values (v_new, v_org, p_project_id, p_doc_date, p_block_id, p_floor_id, p_stage_id, p_crew_id,
    case when v_new <> p_id then p_id end);
  insert into public.material_issue_items (organization_id, project_id, material_issue_id, line_no, material_id,
    unit_id, quantity)
  values (v_org, p_project_id, v_new, 1, p_material_id, gen_random_uuid(), p_quantity);
  v_result := private.post_material_issue_core(v_new, gen_random_uuid());

  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

create or replace function public.save_service_row(
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
    perform private.require(private.can(v_org, p_project_id, 'material_issues.post'), 'BF_FORBIDDEN', '42501');
    insert into public.service_usages (id, organization_id, project_id, doc_date, service_id, quantity, block_id,
      floor_id, stage_id, crew_id)
    values (p_id, v_org, p_project_id, p_doc_date, v_service, p_quantity, p_block_id, p_floor_id, p_stage_id,
      p_crew_id);
  end if;
  v_result := jsonb_build_object('id', p_id, 'service_id', v_service);
  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

create or replace function public.cancel_service_row(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.service_usages;
begin
  select * into v_row from public.service_usages where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.can(v_row.organization_id, v_row.project_id, 'material_issues.post')
                          or private.can(v_row.organization_id, v_row.project_id,
                                         'goods_receipts.approve_correction'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(private.can_fix_stock_row(v_row.organization_id, v_row.project_id, v_row.doc_date),
                          'BF_ROW_TOO_OLD');
  update public.service_usages set status = 'CANCELLED' where id = p_id;
end $$;

-- ROLLBACK: вернуть save_receipt_row, save_issue_row, save_service_row, cancel_service_row из
--   20261025000000_warehouse_sheets.sql, post/reverse_material_issue из 20261014000200_warehouse.sql;
--   drop function private.post_material_issue_core(uuid, uuid), private.reverse_material_issue_core(uuid, uuid, text).
