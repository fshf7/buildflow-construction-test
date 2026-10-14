-- =====================================================================================
-- 0015 Фаза 5: импорт справочников из XLSX (Д-85) — материалы, поставщики, бригады.
-- Всё или ничего (одна транзакция), идемпотентно по ключу, права — в БД. Существующие записи
-- (сравнение без учёта регистра и лишних пробелов): «пропустить» или «обновить». Цен нет.
-- =====================================================================================

-- Ключ сравнения: нижний регистр, пробелы схлопнуты.
create function private.norm(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;

/**
 * p_kind: materials | suppliers | crews; p_mode: skip | update.
 * p_rows: [{row, …поля}] — номер строки файла для сообщений об ошибках.
 *   materials: name, unit_code, code?, category?
 *   suppliers: name, tax_id?, phone?, contact_person?, address?
 *   crews:     name, leader_name?, phone?, foreman_email?
 * Ошибки строк — BF_IMPORT_INVALID, detail: [{row, message}] (первые 50); ничего не записывается.
 */
create function public.import_catalog(p_org uuid, p_kind text, p_key uuid, p_rows jsonb, p_mode text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cached jsonb;
  v_result jsonb;
  v_errors jsonb := '[]';
  v_row jsonb;
  v_n int;
  v_id uuid;
  v_unit uuid;
  v_foreman uuid;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
begin
  perform private.require(p_kind in ('materials', 'suppliers', 'crews') and p_mode in ('skip', 'update'),
                          'BF_INVALID_ARGUMENT');
  perform private.require(private.has_permission(p_org,
                            case p_kind when 'crews' then 'crews.manage' else 'catalog.manage' end),
                          'BF_FORBIDDEN', '42501');
  perform private.require(jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) between 1 and 5000,
                          'BF_IMPORT_SIZE');
  v_cached := private.idempotency_begin(p_org, p_key, 'import_catalog:' || p_kind, null);
  if v_cached is not null then return v_cached; end if;

  -- 1. Проверка всех строк до записи (обязательные поля, ссылки, дубли внутри файла).
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_n := coalesce((v_row ->> 'row')::int, 0);
    if private.norm(v_row ->> 'name') is null then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'message', 'не указано название');
    end if;
    if p_kind = 'materials' and not exists (
         select 1 from public.units_of_measure u
         where u.organization_id = p_org and private.norm(u.code) = private.norm(v_row ->> 'unit_code')) then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'message',
        format('неизвестная единица «%s»', coalesce(v_row ->> 'unit_code', '')));
    end if;
    if p_kind = 'crews' and private.norm(v_row ->> 'foreman_email') is not null and not exists (
         select 1 from public.organization_members m
         join public.member_roles mr on mr.member_id = m.id
         join public.roles r on r.id = mr.role_id and r.code = 'foreman'
         where m.organization_id = p_org and m.is_active
           and private.norm(m.email) = private.norm(v_row ->> 'foreman_email')) then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'message',
        format('прораб %s не найден среди активных прорабов', v_row ->> 'foreman_email'));
    end if;
  end loop;
  -- Дубли внутри файла: тот же ключ сравнения дважды.
  v_errors := v_errors || coalesce((
    select jsonb_agg(jsonb_build_object('row', d.row_no, 'message', 'повтор в файле: ' || d.k))
    from (
      select (r ->> 'row')::int as row_no,
             case when p_kind = 'materials' and private.norm(r ->> 'code') is not null then 'код ' || (r ->> 'code')
                  when p_kind = 'suppliers' and private.norm(r ->> 'tax_id') is not null then 'ИНН ' || (r ->> 'tax_id')
                  else r ->> 'name' end as k,
             row_number() over (partition by
               case when p_kind = 'materials' and private.norm(r ->> 'code') is not null then 'c:' || private.norm(r ->> 'code')
                    when p_kind = 'suppliers' and private.norm(r ->> 'tax_id') is not null then 't:' || private.norm(r ->> 'tax_id')
                    else 'n:' || private.norm(r ->> 'name') end
               order by (r ->> 'row')::int) as dup
      from jsonb_array_elements(p_rows) r
      where private.norm(r ->> 'name') is not null
    ) d where d.dup > 1), '[]');
  if jsonb_array_length(v_errors) > 0 then
    raise exception using errcode = 'P0001', message = 'BF_IMPORT_INVALID',
      detail = (select jsonb_agg(e) from (select e from jsonb_array_elements(v_errors) e
                                          order by (e ->> 'row')::int limit 50) x)::text;
  end if;

  -- 2. Запись. Совпадение: материал — по коду, иначе по названию; поставщик — по ИНН, иначе по
  --    названию; бригада — по названию.
  for v_row in select value from jsonb_array_elements(p_rows) order by (value ->> 'row')::int loop
    if p_kind = 'materials' then
      select u.id into v_unit from public.units_of_measure u
      where u.organization_id = p_org and private.norm(u.code) = private.norm(v_row ->> 'unit_code');
      select m.id into v_id from public.materials m
      where m.organization_id = p_org
        and (case when private.norm(v_row ->> 'code') is not null then private.norm(m.code) = private.norm(v_row ->> 'code')
                  else private.norm(m.name) = private.norm(v_row ->> 'name') end)
      limit 1;
      if v_id is null then
        insert into public.materials (organization_id, code, name, unit_id, category)
        values (p_org, nullif(trim(v_row ->> 'code'), ''), trim(v_row ->> 'name'), v_unit,
                nullif(trim(v_row ->> 'category'), ''));
        v_created := v_created + 1;
      elsif p_mode = 'update' then
        -- Единицу существующего материала не меняем: по нему могут быть движения (Д-21).
        update public.materials
           set name = trim(v_row ->> 'name'), category = nullif(trim(v_row ->> 'category'), '')
         where id = v_id;
        v_updated := v_updated + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    elsif p_kind = 'suppliers' then
      select s.id into v_id from public.suppliers s
      where s.organization_id = p_org
        and (case when private.norm(v_row ->> 'tax_id') is not null then private.norm(s.tax_id) = private.norm(v_row ->> 'tax_id')
                  else private.norm(s.name) = private.norm(v_row ->> 'name') end)
      limit 1;
      if v_id is null then
        insert into public.suppliers (organization_id, name, tax_id, phone, contact_person, address)
        values (p_org, trim(v_row ->> 'name'), nullif(trim(v_row ->> 'tax_id'), ''), nullif(trim(v_row ->> 'phone'), ''),
                nullif(trim(v_row ->> 'contact_person'), ''), nullif(trim(v_row ->> 'address'), ''));
        v_created := v_created + 1;
      elsif p_mode = 'update' then
        update public.suppliers
           set name = trim(v_row ->> 'name'),
               tax_id = coalesce(nullif(trim(v_row ->> 'tax_id'), ''), tax_id),
               phone = coalesce(nullif(trim(v_row ->> 'phone'), ''), phone),
               contact_person = coalesce(nullif(trim(v_row ->> 'contact_person'), ''), contact_person),
               address = coalesce(nullif(trim(v_row ->> 'address'), ''), address)
         where id = v_id;
        v_updated := v_updated + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    else
      select m.id into v_foreman from public.organization_members m
      where m.organization_id = p_org and private.norm(m.email) = private.norm(v_row ->> 'foreman_email');
      select c.id into v_id from public.crews c
      where c.organization_id = p_org and private.norm(c.name) = private.norm(v_row ->> 'name');
      if v_id is null then
        insert into public.crews (organization_id, name, leader_name, phone, foreman_member_id)
        values (p_org, trim(v_row ->> 'name'), nullif(trim(v_row ->> 'leader_name'), ''),
                nullif(trim(v_row ->> 'phone'), ''), v_foreman);
        v_created := v_created + 1;
      elsif p_mode = 'update' then
        update public.crews
           set leader_name = coalesce(nullif(trim(v_row ->> 'leader_name'), ''), leader_name),
               phone = coalesce(nullif(trim(v_row ->> 'phone'), ''), phone),
               foreman_member_id = coalesce(v_foreman, foreman_member_id)
         where id = v_id;
        v_updated := v_updated + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    end if;
    v_id := null; v_foreman := null; v_unit := null;
  end loop;

  v_result := jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped);
  perform private.idempotency_finish(p_org, p_key, v_result);
  return v_result;
end $$;

revoke all on function private.norm(text) from public, anon, authenticated;
revoke all on function public.import_catalog(uuid, text, uuid, jsonb, text) from public, anon;
grant execute on function public.import_catalog(uuid, text, uuid, jsonb, text) to authenticated;

-- ROLLBACK: drop function public.import_catalog(uuid, text, uuid, jsonb, text), private.norm(text);
