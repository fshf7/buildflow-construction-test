-- Д-111 (уточнение): исправление строки журнала услуг сохраняет её заявку, даже если заявку уже
-- закрыли (DONE); новую привязку — только к согласованной (APPROVED). Только функция.

create or replace function public.save_service_row(
  p_id uuid, p_key uuid, p_project_id uuid, p_doc_date date, p_service_id uuid, p_service_name text,
  p_unit_id uuid, p_quantity numeric, p_block_id uuid, p_floor_id uuid, p_stage_id uuid, p_crew_id uuid,
  p_request_id uuid default null
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

  -- Д-111: строка может ссылаться на согласованную заявку этого объекта и этой услуги. При
  -- исправлении строки её прежняя заявка сохраняется, даже если заявку уже закрыли.
  if p_request_id is not null then
    perform private.require(exists (select 1 from public.service_requests r
                                    where r.id = p_request_id and r.project_id = p_project_id
                                      and r.service_id = v_service
                                      and (r.status = 'APPROVED'
                                           or (v_row.id is not null
                                               and v_row.service_request_id = p_request_id))),
                            'BF_SERVICE_REQUEST_MISMATCH');
  end if;
  if v_row.id is not null then
    perform private.require(v_row.organization_id = v_org and v_row.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_row.status = 'ACTIVE', 'BF_INVALID_STATUS', 'P0001', v_row.status);
    perform private.require(private.can_fix_stock_row(v_org, p_project_id, v_row.doc_date), 'BF_ROW_TOO_OLD');
    update public.service_usages
       set doc_date = p_doc_date, service_id = v_service, quantity = p_quantity, block_id = p_block_id,
           floor_id = p_floor_id, stage_id = p_stage_id, crew_id = p_crew_id,
           service_request_id = p_request_id
     where id = p_id;
  else
    perform private.require(private.can(v_org, p_project_id, 'material_issues.post'), 'BF_FORBIDDEN', '42501');
    insert into public.service_usages (id, organization_id, project_id, doc_date, service_id, quantity, block_id,
      floor_id, stage_id, crew_id, service_request_id)
    values (p_id, v_org, p_project_id, p_doc_date, v_service, p_quantity, p_block_id, p_floor_id, p_stage_id,
      p_crew_id, p_request_id);
  end if;
  v_result := jsonb_build_object('id', p_id, 'service_id', v_service);
  perform private.idempotency_finish(v_org, p_key, v_result);
  return v_result;
end $$;

-- ROLLBACK: версия save_service_row из 20261104000200_service_requests.sql.
