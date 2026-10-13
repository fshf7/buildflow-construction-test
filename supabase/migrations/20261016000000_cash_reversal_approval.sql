-- =====================================================================================
-- 0010 Д-67 (изменено 16.10.2026): сторно кассовой операции кассир только инициирует,
-- проводит после согласования бухгалтер; согласующий ≠ инициатор (проверка в БД);
-- причина обязательна. Отчёт «Сторно за период» — бухгалтер и org_admin.
-- Статус решения — временно до ТЗ 1.0.
-- =====================================================================================

alter table public.cash_transactions
  add column reversal_requested_by uuid references auth.users (id),
  add column reversal_requested_at timestamptz,
  add column reversal_reason       text,
  add column reversal_approved_by  uuid references auth.users (id),
  add column reversal_approved_at  timestamptz,
  -- Д-67: согласующий сторно ≠ инициатор.
  add constraint cash_transactions_reversal_approver_check
    check (reversal_approved_by is null or reversal_approved_by <> reversal_requested_by),
  add constraint cash_transactions_reversal_reason_check
    check (reversal_requested_by is null or length(trim(reversal_reason)) >= 3);

-- -------------------------------------------------------------------------------------
-- Права: cash.reverse — инициировать (кассир); cash.reverse_approve — согласовать (бухгалтер);
-- cash.reversals_report — отчёт (бухгалтер, org_admin).
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
    ('accountant', 'purchase_requests.view'), ('accountant', 'purchase_requests.manage'),
    ('accountant', 'prices.view'), ('accountant', 'supplier_invoices.view'),
    ('accountant', 'supplier_invoices.manage'), ('accountant', 'stock.view'),
    ('accountant', 'goods_receipts.approve_correction'), ('accountant', 'payables.view'),
    ('accountant', 'payment_requests.view'), ('accountant', 'payment_requests.approve'),
    ('accountant', 'cash.view'), ('accountant', 'crews.view'), ('accountant', 'work_acts.view'),
    ('accountant', 'tasks.view'), ('accountant', 'reports.view'), ('accountant', 'audit.view'),
    ('accountant', 'opening_balances.manage'),
    ('accountant', 'cash.reverse_approve'), ('accountant', 'cash.reversals_report'),

    ('warehouse', 'projects.view'), ('warehouse', 'purchase_requests.view'),
    ('warehouse', 'supplier_invoices.view'), ('warehouse', 'stock.view'),
    ('warehouse', 'goods_receipts.post'), ('warehouse', 'material_issues.post'),
    ('warehouse', 'tasks.view'), ('warehouse', 'tasks.execute'),

    ('cashier', 'projects.view'), ('cashier', 'supplier_invoices.view'), ('cashier', 'payables.view'),
    ('cashier', 'payment_requests.view'), ('cashier', 'payment_requests.create'),
    ('cashier', 'cash.view'), ('cashier', 'cash.post'), ('cashier', 'cash.reverse'),
    ('cashier', 'cash_accounts.manage'), ('cashier', 'crews.view'), ('cashier', 'work_acts.view'),
    ('cashier', 'tasks.view'), ('cashier', 'tasks.execute'), ('cashier', 'reports.view'),

    ('foreman', 'projects.view'), ('foreman', 'stock.view_own_crews'), ('foreman', 'crews.view'),
    ('foreman', 'crews.manage'), ('foreman', 'work_acts.view'), ('foreman', 'work_acts.create'),
    ('foreman', 'tasks.view'), ('foreman', 'tasks.execute'),

    ('project_manager', 'projects.view'), ('project_manager', 'projects.manage'),
    ('project_manager', 'purchase_requests.view'), ('project_manager', 'prices.view'),
    ('project_manager', 'supplier_invoices.view'), ('project_manager', 'stock.view'),
    ('project_manager', 'payables.view'), ('project_manager', 'payment_requests.view'),
    ('project_manager', 'cash.view'), ('project_manager', 'crews.view'),
    ('project_manager', 'crews.manage'), ('project_manager', 'work_acts.view'),
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

-- Прямое сторно кассиром больше не допускается.
drop function public.reverse_cash_transaction(uuid, uuid, text);

-- -------------------------------------------------------------------------------------
-- Запрос, согласование и отклонение сторно
-- -------------------------------------------------------------------------------------
create function public.request_cash_reversal(p_id uuid, p_key uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.cash_transactions;
  v_cached jsonb;
  v_result jsonb;
  v_reason text;
  v_approval uuid;
begin
  select * into v_doc from public.cash_transactions where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'request_cash_reversal', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'cash.reverse'), 'BF_FORBIDDEN', '42501');
  -- Начальные остатки — только документом ввода; запись-сторно не сторнируется.
  perform private.require(v_doc.status = 'POSTED' and v_doc.kind = 'REGULAR', 'BF_INVALID_STATUS', 'P0001',
                          v_doc.status::text);
  perform private.require(v_doc.reversal_requested_by is null, 'BF_REVERSAL_PENDING');
  v_reason := private.require_comment(p_reason);

  update public.cash_transactions
     set reversal_requested_by = (select auth.uid()), reversal_requested_at = now(), reversal_reason = v_reason
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status, 'reversal', 'PENDING') into v_result;

  insert into public.approval_requests (organization_id, project_id, doc_type, doc_id, required_permission)
  values (v_doc.organization_id, v_doc.project_id,
          case when v_doc.direction = 'IN' then 'CASH_IN'::public.document_type else 'CASH_OUT' end,
          p_id, 'cash.reverse_approve')
  returning id into v_approval;
  insert into public.approval_actions (organization_id, approval_request_id, action, comment)
  values (v_doc.organization_id, v_approval, 'SUBMIT', v_reason);

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function private.decide_cash_reversal(p_id uuid, p_key uuid, p_approve boolean, p_comment text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.cash_transactions;
  v_cached jsonb;
  v_result jsonb;
  v_approval uuid;
  v_comment text := case when p_approve then nullif(trim(p_comment), '') else private.require_comment(p_comment) end;
begin
  select * into v_doc from public.cash_transactions where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key,
    case when p_approve then 'approve_cash_reversal' else 'reject_cash_reversal' end, p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'cash.reverse_approve'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'POSTED' and v_doc.reversal_requested_by is not null,
                          'BF_NO_REVERSAL_REQUEST');
  -- Д-67: согласующий ≠ инициатор (дублирует CHECK — понятное сообщение).
  perform private.require(v_doc.reversal_requested_by is distinct from (select auth.uid()), 'BF_SELF_APPROVAL');

  select id into v_approval from public.approval_requests
  where doc_id = p_id and status = 'PENDING' and required_permission = 'cash.reverse_approve' for update;

  if p_approve then
    update public.cash_transactions
       set reversal_approved_by = (select auth.uid()), reversal_approved_at = now()
     where id = p_id
    returning * into v_doc;
    v_result := private.reverse_cash_tx(v_doc, v_doc.reversal_reason);
  else
    update public.cash_transactions
       set reversal_requested_by = null, reversal_requested_at = null, reversal_reason = null
     where id = p_id
    returning jsonb_build_object('id', id, 'number', number, 'status', status, 'reversal', 'REJECTED') into v_result;
  end if;

  update public.approval_requests
     set status = case when p_approve then 'APPROVED'::public.approval_status else 'REJECTED' end,
         decided_at = now(), decided_by = (select auth.uid())
   where id = v_approval;
  insert into public.approval_actions (organization_id, approval_request_id, action, comment)
  values (v_doc.organization_id, v_approval,
          case when p_approve then 'APPROVE'::public.approval_action else 'REJECT' end, v_comment);

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.approve_cash_reversal(p_id uuid, p_key uuid, p_comment text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.decide_cash_reversal(p_id, p_key, true, p_comment)
$$;
create function public.reject_cash_reversal(p_id uuid, p_key uuid, p_comment text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.decide_cash_reversal(p_id, p_key, false, p_comment)
$$;

-- -------------------------------------------------------------------------------------
-- Отчёт «Сторно за период»: кто инициировал, кто согласовал, сумма, причина.
-- Отдельное право: org_admin не видит кассовые операции, но отчёт о сторно ему нужен.
-- -------------------------------------------------------------------------------------
create function public.cash_reversals_report(p_org uuid, p_from date, p_to date)
returns table (
  transaction_id uuid, number text, doc_date date, account_name text, direction public.cash_direction,
  category public.cash_category, amount numeric, currency char(3), counterparty text,
  reversal_number text, reversed_at timestamptz, reason text,
  initiated_by text, initiated_at timestamptz, approved_by text, approved_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require(private.has_permission(p_org, 'cash.reversals_report'), 'BF_FORBIDDEN', '42501');
  return query
    select t.id, t.number, t.doc_date, a.name, t.direction, t.category, t.amount, t.currency,
           coalesce(s.name, c.name, t.counterparty_name), r.number, t.cancelled_at, t.reversal_reason,
           mi.full_name, t.reversal_requested_at, ma.full_name, t.reversal_approved_at
    from public.cash_transactions t
    join public.cash_accounts a on a.id = t.cash_account_id
    join public.cash_transactions r on r.reversal_of_id = t.id
    left join public.suppliers s on s.id = t.counterparty_supplier_id
    left join public.crews c on c.id = t.counterparty_crew_id
    left join public.organization_members mi on mi.organization_id = t.organization_id and mi.user_id = t.reversal_requested_by
    left join public.organization_members ma on ma.organization_id = t.organization_id and ma.user_id = t.reversal_approved_by
    where t.organization_id = p_org and t.status = 'REVERSED' and t.kind = 'REGULAR'
      and (t.cancelled_at at time zone 'Asia/Dushanbe')::date between coalesce(p_from, '-infinity'::date) and coalesce(p_to, 'infinity'::date)
    order by t.cancelled_at desc;
end $$;

revoke all on function private.decide_cash_reversal(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.request_cash_reversal(uuid, uuid, text), public.approve_cash_reversal(uuid, uuid, text),
  public.reject_cash_reversal(uuid, uuid, text), public.cash_reversals_report(uuid, date, date) from public, anon;
grant execute on function public.request_cash_reversal(uuid, uuid, text), public.approve_cash_reversal(uuid, uuid, text),
  public.reject_cash_reversal(uuid, uuid, text), public.cash_reversals_report(uuid, date, date) to authenticated;

-- ROLLBACK:
--   drop function public.cash_reversals_report(uuid, date, date), public.reject_cash_reversal(uuid, uuid, text),
--     public.approve_cash_reversal(uuid, uuid, text), private.decide_cash_reversal(uuid, uuid, boolean, text),
--     public.request_cash_reversal(uuid, uuid, text);
--   вернуть public.reverse_cash_transaction из 20261015000100_finance.sql;
--   alter table public.cash_transactions drop constraint cash_transactions_reversal_reason_check,
--     drop constraint cash_transactions_reversal_approver_check, drop column reversal_approved_at,
--     drop column reversal_approved_by, drop column reversal_reason, drop column reversal_requested_at,
--     drop column reversal_requested_by;
--   delete from public.permissions where code in ('cash.reverse_approve', 'cash.reversals_report');
