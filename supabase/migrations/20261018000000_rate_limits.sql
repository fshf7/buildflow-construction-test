-- =====================================================================================
-- 0014 Фаза 5: ограничение частоты запросов без платных сервисов (Д-80) и health-check (Д-84).
-- Счётчик фиксированных окон в Postgres: одна строка на (ключ, окно). Ключ — хэш (sha256)
-- из названия действия и IP/email/user_id: открытых персональных данных в таблице нет.
-- =====================================================================================

create table private.rate_limits (
  bucket       text not null check (bucket ~ '^[a-z_]+:[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits         int not null default 1,
  primary key (bucket, window_start)
);
create index on private.rate_limits (window_start);

/**
 * Засчитать попытку. true — попытка разрешена; false — лимит окна исчерпан.
 * p_bucket = '<действие>:<sha256 ключа>' (хэш считает приложение). Атомарно: insert … on conflict.
 */
create function public.rate_limit_hit(p_bucket text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  perform private.require(p_max > 0 and p_window_seconds between 1 and 86400, 'BF_INVALID_ARGUMENT');
  insert into private.rate_limits (bucket, window_start) values (p_bucket, v_window)
  on conflict (bucket, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into v_hits;
  -- Уборка старых окон (сутки) — изредка, чтобы не нагружать каждый вызов.
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end $$;

-- Health-check (Д-84): БД отвечает. Без данных, доступно и без входа.
create function public.health() returns int
language sql stable set search_path = '' as $$ select 1 $$;

revoke all on table private.rate_limits from public, anon, authenticated;
revoke all on function public.rate_limit_hit(text, int, int), public.health() from public, anon, authenticated;
-- Счётчик вызывает только сервер приложения (service_role): иначе любой мог бы засорять таблицу
-- или исчерпать чужой лимит прямым вызовом RPC.
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
grant execute on function public.health() to anon, authenticated, service_role;

-- ROLLBACK: drop function public.rate_limit_hit(text, int, int), public.health(); drop table private.rate_limits;
