-- Д-102: поставщика склад не указывает — по решению владельца удаляется и у старых приёмок.
-- Поставщик, цены и суммы — только в накладной бухгалтера. Колонка goods_receipts.supplier_id
-- остаётся (необязательная, пустая): на неё ссылаются функции приёмки.
-- ДЕСТРУКТИВНО (данные): поставщик старых приёмок стирается — подтверждено владельцем 27.10.2026.
-- Изменения попадают в audit_logs (триггер аудита), там же остаются прежние значения.

update public.goods_receipts set supplier_id = null where supplier_id is not null;

-- Отчёт склада «Приход за период» — без колонки «Поставщик».
drop function public.report_warehouse_incoming(uuid, date, date);

create function public.report_warehouse_incoming(p_project uuid, p_from date, p_to date)
returns table (material_id uuid, material text, unit text, quantity numeric)
language sql stable security invoker set search_path = '' as $$
  select m.material_id, mt.name, u.code, sum(m.quantity)
  from public.stock_movements m
  join public.materials mt on mt.id = m.material_id
  join public.units_of_measure u on u.id = mt.unit_id
  where m.project_id = p_project and m.movement_type in ('RECEIPT', 'RECEIPT_REVERSAL')
    and m.occurred_on between p_from and p_to
  group by m.material_id, mt.name, u.code
  having sum(m.quantity) <> 0
  order by mt.name
$$;

revoke all on function public.report_warehouse_incoming(uuid, date, date) from public, anon;
grant execute on function public.report_warehouse_incoming(uuid, date, date) to authenticated;

-- ROLLBACK:
--   report_warehouse_incoming — вернуть версию из 20261025000000_warehouse_sheets.sql;
--   поставщиков старых приёмок восстановить из audit_logs (old_data ->> 'supplier_id').
