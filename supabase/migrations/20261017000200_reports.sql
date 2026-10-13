-- =====================================================================================
-- 0013 Фаза 4: базовые отчёты (П-26, Д-75). Все функции SECURITY INVOKER — работают
-- поверх RLS вызывающего: управляющий получает только закреплённые объекты, склад —
-- только количества (цен в складских отчётах нет вообще). Итоги сходятся со сверочными
-- функциями check_stock_consistency / check_cash_consistency (проверяется тестами).
-- =====================================================================================

-- Остатки на сейчас = кэш stock_balances (источник истины — движения, сверка пуста).
create function public.report_stock_balances(p_org uuid, p_project uuid default null)
returns table (project_id uuid, project_code text, project_name text, warehouse_name text, material_id uuid,
               material_name text, unit_code text, quantity numeric)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.has_permission(p_org, 'stock.view') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  return query
    select b.project_id, p.code, p.name, w.name, b.material_id, m.name, u.code, b.quantity
    from public.stock_balances b
    join public.projects p on p.id = b.project_id
    join public.warehouses w on w.id = b.warehouse_id
    join public.materials m on m.id = b.material_id
    join public.units_of_measure u on u.id = m.unit_id
    where b.organization_id = p_org and (p_project is null or b.project_id = p_project) and b.quantity <> 0
    order by p.code, m.name;
end $$;

-- Движение материалов на объекты: выдано, возвращено и чистый расход по объекту, блоку, этажу,
-- бригаде и материалу. Только проведённые документы (сторнированные взаимно погашены).
create function public.report_material_issues(
  p_org uuid, p_from date default null, p_to date default null, p_project uuid default null,
  p_block uuid default null, p_floor uuid default null, p_crew uuid default null
)
returns table (project_code text, block_name text, floor_name text, crew_name text, material_name text,
               unit_code text, issued numeric, returned numeric, net numeric)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not (private.has_permission(p_org, 'stock.view') or private.has_permission(p_org, 'stock.view_own_crews')) then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  return query
    with lines as (
      select i.project_id, i.block_id, i.floor_id, i.crew_id, ii.material_id, ii.quantity as issued,
             0::numeric as returned
      from public.material_issues i join public.material_issue_items ii on ii.material_issue_id = i.id
      where i.organization_id = p_org and i.status = 'POSTED'
        and (p_from is null or i.doc_date >= p_from) and (p_to is null or i.doc_date <= p_to)
      union all
      select i.project_id, i.block_id, i.floor_id, i.crew_id, ri.material_id, 0, ri.quantity
      from public.material_returns r
      join public.material_return_items ri on ri.material_return_id = r.id
      join public.material_issues i on i.id = r.material_issue_id
      where r.organization_id = p_org and r.status = 'POSTED'
        and (p_from is null or r.doc_date >= p_from) and (p_to is null or r.doc_date <= p_to)
    )
    select p.code, b.name, f.name, c.name, m.name, u.code, sum(l.issued), sum(l.returned),
           sum(l.issued) - sum(l.returned)
    from lines l
    join public.projects p on p.id = l.project_id
    join public.crews c on c.id = l.crew_id
    join public.materials m on m.id = l.material_id
    join public.units_of_measure u on u.id = m.unit_id
    left join public.blocks b on b.id = l.block_id
    left join public.floors f on f.id = l.floor_id
    where (p_project is null or l.project_id = p_project) and (p_block is null or l.block_id = p_block)
      and (p_floor is null or l.floor_id = p_floor) and (p_crew is null or l.crew_id = p_crew)
    group by p.code, b.name, f.name, c.name, m.name, u.code
    order by p.code, b.name nulls first, f.name nulls first, c.name, m.name;
end $$;

-- Долги поставщикам и бригадам: по обязательствам, с оплатами (кэш paid_amount = Σ оплат —
-- сверяется check_cash_consistency). Отменённые обязательства не входят.
create function public.report_payables(
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
    left join public.opening_balances ob on x.source_doc_type = 'OPENING_BALANCE' and ob.id = x.source_doc_id
    where x.organization_id = p_org and x.status <> 'CANCELLED'
      and (p_kind is null or x.counterparty_kind = p_kind)
      and (p_project is null or x.project_id = p_project)
      and (not p_open_only or x.amount > x.paid_amount)
    order by 3, 7, 6;
end $$;

-- Балансы и движение касс за период: начальный баланс, приходы, расходы, конечный баланс.
-- Учитываются проведённые операции и записи-сторно (как в check_cash_consistency); без
-- границы «по» конечный баланс = cash_accounts.balance.
create function public.report_cash(p_org uuid, p_from date default null, p_to date default null,
                                   p_account uuid default null)
returns table (account_id uuid, account_name text, currency text, opening numeric, income numeric,
               expense numeric, closing numeric)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.has_permission(p_org, 'cash.view') then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  return query
    with tx as (
      select t.cash_account_id, t.doc_date, case when t.direction = 'IN' then t.amount else -t.amount end as delta
      from public.cash_transactions t
      where t.organization_id = p_org and t.status in ('POSTED', 'REVERSED')
        and (p_to is null or t.doc_date <= p_to)
    )
    select a.id, a.name, a.currency::text,
           coalesce(sum(tx.delta) filter (where p_from is not null and tx.doc_date < p_from), 0),
           coalesce(sum(tx.delta) filter (where (p_from is null or tx.doc_date >= p_from) and tx.delta > 0), 0),
           coalesce(-sum(tx.delta) filter (where (p_from is null or tx.doc_date >= p_from) and tx.delta < 0), 0),
           coalesce(sum(tx.delta), 0)
    from public.cash_accounts a
    left join tx on tx.cash_account_id = a.id
    where a.organization_id = p_org and (p_account is null or a.id = p_account)
    group by a.id, a.name, a.currency
    order by a.name;
end $$;

-- Акты выполненных работ с оплатами (кассир по RLS видит только утверждённые, Д-71).
create function public.report_work_acts(
  p_org uuid, p_from date default null, p_to date default null, p_project uuid default null,
  p_crew uuid default null, p_status public.work_act_status default null
)
returns table (act_id uuid, number text, doc_date date, project_code text, crew_name text,
               status public.work_act_status, total numeric, paid numeric, remaining numeric, currency text)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not (private.has_permission(p_org, 'work_acts.view') or private.has_permission(p_org, 'work_acts.view_approved')) then
    raise exception using errcode = '42501', message = 'BF_FORBIDDEN';
  end if;
  return query
    select a.id, a.number, a.doc_date, p.code, c.name, a.status, a.total_amount,
           case when a.status = 'APPROVED' then coalesce(x.paid_amount, 0) end,
           case when a.status = 'APPROVED' then a.total_amount - coalesce(x.paid_amount, 0) end,
           a.currency::text
    from public.work_completion_acts a
    join public.projects p on p.id = a.project_id
    join public.crews c on c.id = a.crew_id
    left join public.payables x on x.source_doc_type = 'WORK_ACT' and x.source_doc_id = a.id
    where a.organization_id = p_org and a.status <> 'DRAFT'
      and (p_from is null or a.doc_date >= p_from) and (p_to is null or a.doc_date <= p_to)
      and (p_project is null or a.project_id = p_project) and (p_crew is null or a.crew_id = p_crew)
      and (p_status is null or a.status = p_status)
    order by a.doc_date desc, a.number desc;
end $$;

revoke all on function public.report_stock_balances(uuid, uuid),
  public.report_material_issues(uuid, date, date, uuid, uuid, uuid, uuid),
  public.report_payables(uuid, public.payable_counterparty, uuid, boolean),
  public.report_cash(uuid, date, date, uuid),
  public.report_work_acts(uuid, date, date, uuid, uuid, public.work_act_status)
  from public, anon;
grant execute on function public.report_stock_balances(uuid, uuid),
  public.report_material_issues(uuid, date, date, uuid, uuid, uuid, uuid),
  public.report_payables(uuid, public.payable_counterparty, uuid, boolean),
  public.report_cash(uuid, date, date, uuid),
  public.report_work_acts(uuid, date, date, uuid, uuid, public.work_act_status)
  to authenticated;

-- ROLLBACK: drop function (все функции этого файла).
