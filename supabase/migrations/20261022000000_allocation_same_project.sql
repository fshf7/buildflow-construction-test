-- =====================================================================================
-- 0019 Д-95 (решение владельца 20.10.2026, работа «внутри объекта» — Д-94): касса и долги ведутся
-- по объекту. Операция оплачивает обязательства и счета на оплату только своего объекта:
-- payable/payment_request.project_id IS NOT DISTINCT FROM cash_transactions.project_id
-- (операция без объекта — только долги и счета без объекта). Уточняет Д-63: одна операция
-- по-прежнему может закрыть несколько обязательств одного контрагента, но в рамках одного объекта.
-- Проверка — при проведении; проведённые раньше операции не меняются.
-- =====================================================================================

create or replace function private.validate_and_lock_allocations(p_doc public.cash_transactions) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_total numeric(18, 2);
  v_alloc record;
  v_pay public.payables;
  v_req public.payment_requests;
begin
  select coalesce(sum(amount), 0) into v_total from public.cash_transaction_allocations
  where cash_transaction_id = p_doc.id;

  if p_doc.direction = 'IN' then
    -- Приходы без распределений (авансы и возвраты от поставщиков — TODO(TZ-open)).
    perform private.require(v_total = 0, 'BF_ALLOCATION_MISMATCH');
    return;
  end if;

  -- Расход без основания невозможен: Σ распределений = сумма операции (Д-13).
  perform private.require(v_total = p_doc.amount, 'BF_ALLOCATION_MISMATCH', 'P0001',
    jsonb_build_object('amount', p_doc.amount, 'allocated', v_total)::text);

  for v_alloc in
    select a.amount, a.payable_id, a.payment_request_id from public.cash_transaction_allocations a
    where a.cash_transaction_id = p_doc.id
    order by coalesce(a.payable_id, a.payment_request_id)
  loop
    if p_doc.category in ('SUPPLIER', 'CREW_ACT') then
      perform private.require(v_alloc.payable_id is not null, 'BF_ALLOCATION_MISMATCH');
      select * into v_pay from public.payables where id = v_alloc.payable_id for update;
      -- Одна операция — обязательства одного контрагента (Д-63).
      perform private.require(v_pay.organization_id = p_doc.organization_id and v_pay.status <> 'CANCELLED'
        and ((p_doc.category = 'SUPPLIER' and v_pay.counterparty_kind = 'SUPPLIER'
              and v_pay.supplier_id = p_doc.counterparty_supplier_id)
          or (p_doc.category = 'CREW_ACT' and v_pay.counterparty_kind = 'CREW'
              and v_pay.crew_id = p_doc.counterparty_crew_id)), 'BF_ALLOCATION_MISMATCH');
      -- Д-95: долги закрываются операцией своего объекта (или без объекта — долги без объекта).
      perform private.require(v_pay.project_id is not distinct from p_doc.project_id, 'BF_ALLOCATION_PROJECT');
      perform private.require(v_pay.currency = p_doc.currency, 'BF_CURRENCY_MISMATCH');   -- Д-18
      -- Переплата запрещена (Д-17); в ошибке — остаток долга.
      perform private.require(v_pay.paid_amount + v_alloc.amount <= v_pay.amount, 'BF_OVERPAYMENT', 'P0001',
        jsonb_build_object('remaining', v_pay.amount - v_pay.paid_amount, 'requested', v_alloc.amount,
                           'currency', v_pay.currency)::text);
    else
      perform private.require(v_alloc.payment_request_id is not null, 'BF_ALLOCATION_MISMATCH');
      select * into v_req from public.payment_requests where id = v_alloc.payment_request_id for update;
      perform private.require(v_req.organization_id = p_doc.organization_id
        and v_req.status in ('APPROVED', 'PARTIALLY_PAID') and v_req.purpose::text = p_doc.category::text,
        'BF_REQUEST_NOT_APPROVED');
      perform private.require(v_req.project_id is not distinct from p_doc.project_id, 'BF_ALLOCATION_PROJECT');
      perform private.require(v_req.currency = p_doc.currency, 'BF_CURRENCY_MISMATCH');
      perform private.require(v_req.paid_amount + v_alloc.amount <= v_req.amount, 'BF_OVERPAYMENT', 'P0001',
        jsonb_build_object('remaining', v_req.amount - v_req.paid_amount, 'requested', v_alloc.amount,
                           'currency', v_req.currency)::text);
    end if;
  end loop;
end $$;

-- ROLLBACK: вернуть private.validate_and_lock_allocations из 20261015000100_finance.sql.
