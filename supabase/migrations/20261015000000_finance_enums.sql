-- 0007 Новые значения перечислений для фазы 3. Отдельной миграцией: значение, добавленное
-- ALTER TYPE … ADD VALUE, нельзя использовать в той же транзакции.
alter type public.document_type add value if not exists 'OPENING_BALANCE';     -- «Ввод остатков» (Д-61)
alter type public.stock_movement_type add value if not exists 'OPENING_REVERSAL';

-- ROLLBACK: значения enum в Postgres не удаляются; при откате — пересоздание типа (только без данных).
