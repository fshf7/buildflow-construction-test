-- Точное число строк каждой таблицы данных приложения (public, private) — для сверки дампа и восстановления.
select format('%I.%I', n.nspname, c.relname) as tbl,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname),
                                            false, true, '')))[1]::text::bigint as rows
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname in ('public', 'private')
  and c.relname not in ('rate_limits')           -- счётчики частоты — служебные, меняются каждую минуту
order by 1;
