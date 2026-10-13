-- =====================================================================================
-- 0009 «Ввод остатков» (Д-61): начальные остатки склада, касс и долгов поставщикам — обычным
-- документом: атомарно, идемпотентно, с аудитом и сторно. Дата ввода — doc_date.
-- Метод оценки списания и инвентаризация — по-прежнему TODO(TZ-open).
-- =====================================================================================

create type public.opening_kind as enum ('STOCK', 'CASH', 'PAYABLES');
create type public.opening_status as enum ('DRAFT', 'POSTED', 'REVERSED');

-- -------------------------------------------------------------------------------------
-- 1. Право opening_balances.manage (Д-66): бухгалтер и администратор
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
    ('org_admin', 'audit.view'), ('org_admin', 'opening_balances.manage')
  )
  select r.code, r.name, g.perm from roles r join grants g on g.role_code = r.code
$$;

-- Существующим организациям — недостающие права из каталога (данные; матрица по-прежнему правится данными).
insert into public.permissions (organization_id, role_id, code)
select r.organization_id, r.id, c.perm_code
from public.roles r join private.permission_catalog() c on c.role_code = r.code
on conflict (role_id, code) do nothing;

-- -------------------------------------------------------------------------------------
-- 2. Документ и строки
-- -------------------------------------------------------------------------------------
create table public.opening_balances (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  kind            public.opening_kind not null,
  project_id      uuid,                                -- для STOCK — объект (склад объекта)
  warehouse_id    uuid,
  number          text,
  doc_date        date not null default private.today(),   -- дата ввода остатков
  status          public.opening_status not null default 'DRAFT',
  note            text,
  posted_at       timestamptz,
  posted_by       uuid references auth.users (id),
  cancelled_at    timestamptz,
  cancelled_by    uuid references auth.users (id),
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (warehouse_id, organization_id, project_id)
    references public.warehouses (id, organization_id, project_id),
  check ((kind = 'STOCK') = (project_id is not null and warehouse_id is not null)),
  unique (id, organization_id)
);
create unique index opening_balances_number_key on public.opening_balances (organization_id, number)
  where number is not null;
create index on public.opening_balances (organization_id, doc_date desc);
create index on public.opening_balances (project_id);

create table public.opening_stock_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  opening_balance_id uuid not null,
  line_no            int not null check (line_no > 0),
  material_id        uuid not null,
  unit_id            uuid not null,
  quantity           numeric(18, 4) not null check (quantity > 0),   -- без цен (метод оценки — TODO(TZ-open))
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  updated_at         timestamptz not null default now(),
  foreign key (opening_balance_id, organization_id)
    references public.opening_balances (id, organization_id) on delete cascade,
  foreign key (material_id, organization_id) references public.materials (id, organization_id),
  unique (opening_balance_id, line_no),
  unique (opening_balance_id, material_id)
);
create index on public.opening_stock_items (organization_id);
create index on public.opening_stock_items (material_id);

create table public.opening_cash_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  opening_balance_id uuid not null,
  line_no            int not null check (line_no > 0),
  cash_account_id    uuid not null,
  amount             numeric(18, 2) not null check (amount > 0),
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  updated_at         timestamptz not null default now(),
  foreign key (opening_balance_id, organization_id)
    references public.opening_balances (id, organization_id) on delete cascade,
  foreign key (cash_account_id, organization_id) references public.cash_accounts (id, organization_id),
  unique (opening_balance_id, line_no),
  unique (opening_balance_id, cash_account_id)
);
create index on public.opening_cash_items (organization_id);
create index on public.opening_cash_items (cash_account_id);

create table public.opening_payable_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  opening_balance_id uuid not null,
  line_no            int not null check (line_no > 0),
  supplier_id        uuid not null,
  project_id         uuid,
  amount             numeric(18, 2) not null check (amount > 0),
  currency           char(3) not null default 'TJS' check (currency ~ '^[A-Z]{3}$'),
  basis              text not null check (length(trim(basis)) > 0),   -- основание долга
  due_date           date,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  updated_at         timestamptz not null default now(),
  foreign key (opening_balance_id, organization_id)
    references public.opening_balances (id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  unique (opening_balance_id, line_no)
);
create index on public.opening_payable_items (organization_id);
create index on public.opening_payable_items (supplier_id);
create index on public.opening_payable_items (project_id);

alter table public.cash_transactions
  add foreign key (opening_balance_id, organization_id) references public.opening_balances (id, organization_id);

-- -------------------------------------------------------------------------------------
-- 3. Триггеры, RLS, гранты
-- -------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['opening_balances', 'opening_stock_items', 'opening_cash_items',
                           'opening_payable_items'] loop
    execute format('create trigger set_created_by before insert on public.%I
                    for each row execute function private.set_created_by()', t);
    execute format('create trigger before_update_std before update on public.%I
                    for each row execute function private.before_update_std()', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t);
  end loop;
  foreach t in array array['opening_stock_items', 'opening_cash_items', 'opening_payable_items'] loop
    execute format('create trigger guard_lines before insert or update or delete on public.%I
                    for each row execute function private.guard_lines(''opening_balances'', ''opening_balance_id'', ''DRAFT'')', t);
  end loop;
end $$;
create trigger guard_document before update on public.opening_balances
  for each row execute function private.guard_document();
create trigger set_line_unit before insert or update of material_id on public.opening_stock_items
  for each row execute function private.set_line_unit();

-- Видимость по виду: складской ввод — складу и бухгалтерии; денежный — только финансам (§5.4).
create function private.can_view_opening(p_org uuid, p_kind public.opening_kind, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_org, 'opening_balances.manage')
      or (p_kind = 'STOCK' and private.can(p_org, p_project, 'stock.view'))
      or (p_kind = 'CASH' and private.has_permission(p_org, 'cash.view'))
      or (p_kind = 'PAYABLES' and private.has_permission(p_org, 'payables.view'))
$$;

alter table public.opening_balances      enable row level security;
alter table public.opening_stock_items   enable row level security;
alter table public.opening_cash_items    enable row level security;
alter table public.opening_payable_items enable row level security;

create policy opening_balances_select on public.opening_balances for select to authenticated
  using (private.can_view_opening(organization_id, kind, project_id));
create policy opening_stock_items_select on public.opening_stock_items for select to authenticated
  using (exists (select 1 from public.opening_balances h where h.id = opening_balance_id));
create policy opening_cash_items_select on public.opening_cash_items for select to authenticated
  using (exists (select 1 from public.opening_balances h where h.id = opening_balance_id));
create policy opening_payable_items_select on public.opening_payable_items for select to authenticated
  using (exists (select 1 from public.opening_balances h where h.id = opening_balance_id));

revoke all on public.opening_balances, public.opening_stock_items, public.opening_cash_items,
  public.opening_payable_items from anon, authenticated;
grant select on public.opening_balances, public.opening_stock_items, public.opening_cash_items,
  public.opening_payable_items to authenticated;
grant select, insert, update, delete on public.opening_balances, public.opening_stock_items,
  public.opening_cash_items, public.opening_payable_items to service_role;

-- -------------------------------------------------------------------------------------
-- 4. Черновик
-- -------------------------------------------------------------------------------------
-- p_lines по виду: STOCK [{material_id, quantity}], CASH [{cash_account_id, amount}],
-- PAYABLES [{supplier_id, project_id, amount, currency, basis, due_date}].
create function public.save_opening_balance_draft(
  p_id uuid, p_org uuid, p_kind public.opening_kind, p_project_id uuid, p_doc_date date, p_note text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.opening_balances;
  v_warehouse uuid;
begin
  perform private.require(private.has_permission(p_org, 'opening_balances.manage'), 'BF_FORBIDDEN', '42501');
  if p_kind = 'STOCK' then
    perform private.require(p_project_id is not null and private.has_project_access(p_org, p_project_id),
                            'BF_FORBIDDEN', '42501');
    select id into v_warehouse from public.warehouses where project_id = p_project_id;
  end if;

  select * into v_doc from public.opening_balances where id = p_id for update;
  if found then
    perform private.require(v_doc.organization_id = p_org and v_doc.kind = p_kind, 'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    update public.opening_balances set doc_date = coalesce(p_doc_date, doc_date), note = nullif(trim(p_note), '')
     where id = p_id;
    delete from public.opening_stock_items where opening_balance_id = p_id;
    delete from public.opening_cash_items where opening_balance_id = p_id;
    delete from public.opening_payable_items where opening_balance_id = p_id;
  else
    insert into public.opening_balances (id, organization_id, kind, project_id, warehouse_id, doc_date, note)
    values (p_id, p_org, p_kind, case when p_kind = 'STOCK' then p_project_id end, v_warehouse,
            coalesce(p_doc_date, private.today()), nullif(trim(p_note), ''));
  end if;

  if p_kind = 'STOCK' then
    insert into public.opening_stock_items (organization_id, opening_balance_id, line_no, material_id, unit_id, quantity)
    select p_org, p_id, l.ord::int, (l.v ->> 'material_id')::uuid, gen_random_uuid(), (l.v ->> 'quantity')::numeric
    from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord)
    where coalesce((l.v ->> 'quantity')::numeric, 0) > 0;
  elsif p_kind = 'CASH' then
    insert into public.opening_cash_items (organization_id, opening_balance_id, line_no, cash_account_id, amount)
    select p_org, p_id, l.ord::int, (l.v ->> 'cash_account_id')::uuid, (l.v ->> 'amount')::numeric
    from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord)
    where coalesce((l.v ->> 'amount')::numeric, 0) > 0;
  else
    insert into public.opening_payable_items (organization_id, opening_balance_id, line_no, supplier_id, project_id,
      amount, currency, basis, due_date)
    select p_org, p_id, l.ord::int, (l.v ->> 'supplier_id')::uuid, nullif(l.v ->> 'project_id', '')::uuid,
           (l.v ->> 'amount')::numeric, upper(coalesce(nullif(l.v ->> 'currency', ''), 'TJS')), l.v ->> 'basis',
           nullif(l.v ->> 'due_date', '')::date
    from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord)
    where coalesce((l.v ->> 'amount')::numeric, 0) > 0;
  end if;
  return p_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 5. Проведение
-- -------------------------------------------------------------------------------------
create function public.post_opening_balance(p_id uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.opening_balances;
  v_cached jsonb;
  v_result jsonb;
  v_moves uuid[] := '{}';
  v_line record;
begin
  select * into v_doc from public.opening_balances where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'post_opening_balance', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.has_permission(v_doc.organization_id, 'opening_balances.manage'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'DRAFT', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
  perform private.require(
    exists (select 1 from public.opening_stock_items where opening_balance_id = p_id)
    or exists (select 1 from public.opening_cash_items where opening_balance_id = p_id)
    or exists (select 1 from public.opening_payable_items where opening_balance_id = p_id), 'BF_NO_LINES');
  perform private.begin_posting();

  if v_doc.kind = 'STOCK' then
    for v_line in select * from public.opening_stock_items where opening_balance_id = p_id order by material_id loop
      v_moves := v_moves || private.add_movement(v_doc.organization_id, v_doc.project_id, v_doc.warehouse_id,
        v_line.material_id, v_line.quantity, 'OPENING', 'OPENING_BALANCE', p_id, v_line.id, v_doc.doc_date);
    end loop;
    perform private.apply_movements(v_moves);

  elsif v_doc.kind = 'CASH' then
    for v_line in
      select i.*, a.currency from public.opening_cash_items i join public.cash_accounts a on a.id = i.cash_account_id
      where i.opening_balance_id = p_id order by i.cash_account_id
    loop
      insert into public.cash_transactions (organization_id, cash_account_id, kind, direction, category, amount,
        currency, basis, opening_balance_id, doc_date, status, posted_at, posted_by)
      values (v_doc.organization_id, v_line.cash_account_id, 'OPENING', 'IN', 'OPENING_BALANCE', v_line.amount,
        v_line.currency, 'Ввод остатков', p_id, v_doc.doc_date, 'POSTED', now(), (select auth.uid()));
      perform private.apply_cash_delta(v_line.cash_account_id, v_line.amount);
    end loop;

  else
    -- Долги поставщикам на дату ввода: обязательства с источником OPENING_BALANCE (общая модель, Д-63).
    insert into public.payables (organization_id, project_id, counterparty_kind, supplier_id, source_doc_type,
      source_doc_id, amount, currency, due_date, basis)
    select organization_id, project_id, 'SUPPLIER', supplier_id, 'OPENING_BALANCE', id, amount, currency, due_date,
           basis
    from public.opening_payable_items where opening_balance_id = p_id;
  end if;

  update public.opening_balances
     set status = 'POSTED',
         number = coalesce(number, private.next_document_number(organization_id, 'OPENING_BALANCE', doc_date)),
         posted_at = now(), posted_by = (select auth.uid())
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

-- -------------------------------------------------------------------------------------
-- 6. Сторно: склад — обратные движения; кассы — записи-сторно (минус запрещён);
--    долги — отмена, только если по ним нет оплат.
-- -------------------------------------------------------------------------------------
create function public.reverse_opening_balance(p_id uuid, p_key uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.opening_balances;
  v_cached jsonb;
  v_result jsonb;
  v_reason text;
  v_tx public.cash_transactions;
begin
  select * into v_doc from public.opening_balances where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'reverse_opening_balance', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.has_permission(v_doc.organization_id, 'opening_balances.manage'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'POSTED', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
  v_reason := private.require_comment(p_reason);
  perform private.begin_posting();

  if v_doc.kind = 'STOCK' then
    perform private.apply_movements(private.add_reversal_movements('OPENING_BALANCE', p_id, 'OPENING_REVERSAL'));
  elsif v_doc.kind = 'CASH' then
    for v_tx in select * from public.cash_transactions
                where opening_balance_id = p_id and kind = 'OPENING' and status = 'POSTED'
                order by cash_account_id for update loop
      perform private.reverse_cash_tx(v_tx, v_reason);
    end loop;
  else
    perform 1 from public.payables
    where source_doc_type = 'OPENING_BALANCE'
      and source_doc_id in (select id from public.opening_payable_items where opening_balance_id = p_id)
    order by id for update;
    perform private.require(not exists (
      select 1 from public.payables where source_doc_type = 'OPENING_BALANCE' and paid_amount > 0
        and source_doc_id in (select id from public.opening_payable_items where opening_balance_id = p_id)),
      'BF_HAS_PAYMENTS');
    update public.payables set status = 'CANCELLED'
     where source_doc_type = 'OPENING_BALANCE'
       and source_doc_id in (select id from public.opening_payable_items where opening_balance_id = p_id);
  end if;

  update public.opening_balances
     set status = 'REVERSED', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = v_reason
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.delete_opening_balance_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.opening_balances;
begin
  select * into v_doc from public.opening_balances where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  perform private.require(private.has_permission(v_doc.organization_id, 'opening_balances.manage'),
                          'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'DRAFT' and v_doc.number is null, 'BF_DOCUMENT_LOCKED');
  delete from public.opening_balances where id = p_id;
end $$;

revoke all on function private.can_view_opening(uuid, public.opening_kind, uuid) from public, anon;
grant execute on function private.can_view_opening(uuid, public.opening_kind, uuid) to authenticated;
revoke all on function
  public.save_opening_balance_draft(uuid, uuid, public.opening_kind, uuid, date, text, jsonb),
  public.post_opening_balance(uuid, uuid), public.reverse_opening_balance(uuid, uuid, text),
  public.delete_opening_balance_draft(uuid)
  from public, anon;
grant execute on function
  public.save_opening_balance_draft(uuid, uuid, public.opening_kind, uuid, date, text, jsonb),
  public.post_opening_balance(uuid, uuid), public.reverse_opening_balance(uuid, uuid, text),
  public.delete_opening_balance_draft(uuid)
  to authenticated;

-- ROLLBACK:
--   alter table public.cash_transactions drop constraint cash_transactions_opening_balance_id_organization_id_fkey;
--   drop table public.opening_payable_items, public.opening_cash_items, public.opening_stock_items,
--     public.opening_balances cascade;
--   delete from public.permissions where code = 'opening_balances.manage';
--   вернуть private.permission_catalog() из 20261012010000_foundation.sql;
--   drop function (все функции этого файла); drop type public.opening_status, public.opening_kind;
