-- Д-107: фильтр «Бригада» в отчёте склада «Расход по блокам и этапам».
-- report_warehouse_outgoing получает необязательный p_crew: выдачи этой бригады и возвраты по ним
-- (бригада возврата — бригада его выдачи, как блок и этап). Без p_crew — как раньше.
-- Норматив и «выдано по нормативу» — по всему объекту (норматив задаётся на материал+блок+этап).
-- Данные не меняются: только функция.

drop function public.report_warehouse_outgoing(uuid, date, date);

create function public.report_warehouse_outgoing(p_project uuid, p_from date, p_to date,
                                                  p_crew uuid default null)
returns table (material_id uuid, material text, unit text, block text, floor text, stage text,
               quantity numeric, norm numeric, norm_issued numeric)
language sql stable security invoker set search_path = '' as $$
  with moves as (
    select m.material_id, i.block_id, i.floor_id, i.stage_id, -m.quantity as qty
    from public.stock_movements m
    join public.material_issues i on i.id = m.source_doc_id
    where m.project_id = p_project and m.source_doc_type = 'MATERIAL_ISSUE' and m.occurred_on between p_from and p_to
      and (p_crew is null or i.crew_id = p_crew)
    union all
    select m.material_id, i.block_id, i.floor_id, i.stage_id, -m.quantity
    from public.stock_movements m
    join public.material_returns r on r.id = m.source_doc_id
    join public.material_issues i on i.id = r.material_issue_id
    where m.project_id = p_project and m.source_doc_type = 'MATERIAL_RETURN' and m.occurred_on between p_from and p_to
      and (p_crew is null or i.crew_id = p_crew)
  ), grouped as (
    select material_id, block_id, floor_id, stage_id, sum(qty) as qty
    from moves group by material_id, block_id, floor_id, stage_id having sum(qty) <> 0
  )
  select g.material_id, mt.name, u.code, b.name, f.name, st.name, g.qty, nu.norm, nu.issued
  from grouped g
  join public.materials mt on mt.id = g.material_id
  join public.units_of_measure u on u.id = mt.unit_id
  left join public.blocks b on b.id = g.block_id
  left join public.floors f on f.id = g.floor_id
  left join public.work_stages st on st.id = g.stage_id
  left join public.norm_usage(p_project) nu
    on nu.material_id = g.material_id and nu.block_id = g.block_id and nu.stage_id = g.stage_id
  order by mt.name, b.name nulls first, f.name nulls first, st.name nulls first
$$;

revoke all on function public.report_warehouse_outgoing(uuid, date, date, uuid) from public, anon;
grant execute on function public.report_warehouse_outgoing(uuid, date, date, uuid) to authenticated;

-- ROLLBACK:
--   drop function public.report_warehouse_outgoing(uuid, date, date, uuid);
--   вернуть версию (uuid, date, date) из 20261025000000_warehouse_sheets.sql и её гранты.
