-- Сверка по всем организациям (тела check_stock_consistency и check_cash_consistency без проверки прав):
-- остатки = Σ движений; баланс кассы = Σ операций; оплачено по долгам и счетам = Σ распределений.
-- Только чтение. Результат — число расхождений по каждой проверке; всё должно быть 0.
with stock as (
  select 'stock' as check, count(*) as mismatches from (
    select coalesce(b.quantity,0) q, coalesce(s.total,0) t
    from public.stock_balances b
    full join (select warehouse_id, material_id, sum(quantity) total from public.stock_movements group by 1,2) s
      on s.warehouse_id = b.warehouse_id and s.material_id = b.material_id) x where q <> t
), cash as (
  select 'cash_account' as check, count(*) from public.cash_accounts a
  where a.balance <> coalesce((select sum(case when t.direction='IN' then t.amount else -t.amount end)
    from public.cash_transactions t where t.cash_account_id=a.id and t.status in ('POSTED','REVERSED')),0)
), pay as (
  select 'payable' as check, count(*) from public.payables p
  where p.paid_amount <> coalesce((select sum(x.amount) from public.cash_transaction_allocations x
    join public.cash_transactions t on t.id=x.cash_transaction_id where x.payable_id=p.id and t.status='POSTED'),0)
), req as (
  select 'payment_request' as check, count(*) from public.payment_requests r
  where r.paid_amount <> coalesce((select sum(x.amount) from public.cash_transaction_allocations x
    join public.cash_transactions t on t.id=x.cash_transaction_id where x.payment_request_id=r.id and t.status='POSTED'),0)
)
select * from stock union all select * from cash union all select * from pay union all select * from req;
