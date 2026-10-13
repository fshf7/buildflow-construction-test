-- =====================================================================================
-- 0008 Финансы (BP-03, BP-04): кассы и счета, кассовые операции, оплата обязательств,
-- счета на оплату. ARCHITECTURE §2.6, §4.5, §4.7; решения Д-11, Д-13…Д-19, Д-58, Д-61…Д-67.
-- =====================================================================================

create type public.cash_account_kind as enum ('CASH', 'BANK');
create type public.cash_direction as enum ('IN', 'OUT');
create type public.cash_category as enum (
  -- приходы
  'APARTMENT_SALE', 'OWNER_FUNDS', 'OTHER_INCOME',
  -- расходы: SUPPLIER/CREW_ACT — по обязательствам; остальные — по согласованному счёту на оплату (Д-13)
  'SUPPLIER', 'CREW_ACT', 'OTHER_EXPENSE', 'SALARY', 'CREW_EXTRA',
  -- начальный остаток кассы (документ «Ввод остатков», Д-61)
  'OPENING_BALANCE'
);
-- Вид операции расширяемый (Д-65): TRANSFER (переводы между кассами) — TODO(TZ-open), не реализуется.
create type public.cash_tx_kind as enum ('REGULAR', 'REVERSAL', 'OPENING');
create type public.cash_tx_status as enum ('DRAFT', 'POSTED', 'REVERSED');
create type public.payment_purpose as enum ('OTHER_EXPENSE', 'SALARY', 'CREW_EXTRA');
create type public.payment_request_status as enum ('DRAFT', 'APPROVAL', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- -------------------------------------------------------------------------------------
-- 1. Таблицы
-- -------------------------------------------------------------------------------------
create table public.cash_accounts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name            text not null check (length(trim(name)) > 0),
  kind            public.cash_account_kind not null default 'CASH',
  currency        char(3) not null default 'TJS' check (currency ~ '^[A-Z]{3}$'),
  bank_name       text,
  account_number  text,
  project_id      uuid,
  is_active       boolean not null default true,
  balance         numeric(18, 2) not null default 0 check (balance >= 0),   -- кэш (Д-62), Д-19
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  unique (organization_id, name),
  unique (id, organization_id)
);
create index on public.cash_accounts (project_id);

create table public.payment_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  project_id      uuid,
  number          text,
  doc_date        date not null default private.today(),
  status          public.payment_request_status not null default 'DRAFT',
  purpose         public.payment_purpose not null,
  payee_crew_id   uuid,
  payee_name      text,
  amount          numeric(18, 2) not null check (amount > 0),
  currency        char(3) not null default 'TJS' check (currency ~ '^[A-Z]{3}$'),
  paid_amount     numeric(18, 2) not null default 0 check (paid_amount >= 0),   -- кэш
  basis           text,
  status_comment  text,
  note            text,
  posted_at       timestamptz,
  posted_by       uuid references auth.users (id),
  approved_at     timestamptz,
  approved_by     uuid references auth.users (id),
  cancelled_at    timestamptz,
  cancelled_by    uuid references auth.users (id),
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (payee_crew_id, organization_id) references public.crews (id, organization_id),
  check (paid_amount <= amount),
  check (approved_by is null or approved_by <> created_by),   -- Д-14: согласующий ≠ автор
  unique (id, organization_id)
);
create unique index payment_requests_number_key on public.payment_requests (organization_id, number)
  where number is not null;
create index on public.payment_requests (organization_id, doc_date desc);
create index on public.payment_requests (project_id);
create index on public.payment_requests (status);

create table public.cash_transactions (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id),
  cash_account_id          uuid not null,
  kind                     public.cash_tx_kind not null default 'REGULAR',
  direction                public.cash_direction not null,
  category                 public.cash_category not null,
  amount                   numeric(18, 2) not null check (amount > 0),
  currency                 char(3) not null check (currency ~ '^[A-Z]{3}$'),
  project_id               uuid,
  counterparty_supplier_id uuid,
  counterparty_crew_id     uuid,
  counterparty_name        text,
  basis                    text,                        -- «основание» (BP-04)
  reversal_of_id           uuid unique references public.cash_transactions (id),
  opening_balance_id       uuid,                        -- источник для kind = OPENING
  number                   text,
  doc_date                 date not null default private.today(),
  status                   public.cash_tx_status not null default 'DRAFT',
  note                     text,
  posted_at                timestamptz,
  posted_by                uuid references auth.users (id),
  cancelled_at             timestamptz,                 -- сторно
  cancelled_by             uuid references auth.users (id),
  cancel_reason            text,
  created_at               timestamptz not null default now(),
  created_by               uuid references auth.users (id),
  updated_at               timestamptz not null default now(),
  foreign key (cash_account_id, organization_id) references public.cash_accounts (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (counterparty_supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (counterparty_crew_id, organization_id) references public.crews (id, organization_id),
  -- Направление соответствует категории (у записи-сторно — противоположное).
  check (kind = 'REVERSAL'
         or (direction = 'IN' and category in ('APARTMENT_SALE', 'OWNER_FUNDS', 'OTHER_INCOME', 'OPENING_BALANCE'))
         or (direction = 'OUT' and category in ('SUPPLIER', 'CREW_ACT', 'OTHER_EXPENSE', 'SALARY', 'CREW_EXTRA'))),
  -- Начальный остаток — только операцией OPENING (и её сторно).
  check (kind <> 'OPENING' or category = 'OPENING_BALANCE'),
  check (category <> 'OPENING_BALANCE' or kind in ('OPENING', 'REVERSAL')),
  check (kind <> 'REVERSAL' or reversal_of_id is not null),
  unique (id, organization_id)
);
create unique index cash_transactions_number_key on public.cash_transactions (organization_id, number)
  where number is not null;
create index on public.cash_transactions (organization_id, doc_date desc);
create index on public.cash_transactions (cash_account_id, doc_date);
create index on public.cash_transactions (project_id);
create index on public.cash_transactions (counterparty_supplier_id);
create index on public.cash_transactions (opening_balance_id);
create index on public.cash_transactions (status);

create table public.cash_transaction_allocations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  cash_transaction_id uuid not null,
  payable_id          uuid references public.payables (id),
  payment_request_id  uuid references public.payment_requests (id),
  amount              numeric(18, 2) not null check (amount > 0),
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id),
  updated_at          timestamptz not null default now(),
  foreign key (cash_transaction_id, organization_id)
    references public.cash_transactions (id, organization_id) on delete cascade,
  check ((payable_id is not null) <> (payment_request_id is not null)),
  unique (cash_transaction_id, payable_id),
  unique (cash_transaction_id, payment_request_id)
);
create index on public.cash_transaction_allocations (organization_id);
create index on public.cash_transaction_allocations (payable_id);
create index on public.cash_transaction_allocations (payment_request_id);

-- Основание обязательства (для введённых остатков долга — текст из документа «Ввод остатков»).
alter table public.payables add column basis text;

-- Оплаты — представление (Д-11): распределения проведённых (не сторнированных) операций.
create view public.payments with (security_invoker = true) as
  select a.id, a.organization_id, t.project_id, t.cash_account_id, t.id as cash_transaction_id, t.number,
         t.doc_date, t.posted_at, a.payable_id, a.payment_request_id, a.amount, t.currency
  from public.cash_transaction_allocations a
  join public.cash_transactions t on t.id = a.cash_transaction_id
  where t.status = 'POSTED';

-- -------------------------------------------------------------------------------------
-- 2. Триггеры
-- -------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['cash_accounts', 'payment_requests', 'cash_transactions',
                           'cash_transaction_allocations'] loop
    execute format('create trigger set_created_by before insert on public.%I
                    for each row execute function private.set_created_by()', t);
    execute format('create trigger before_update_std before update on public.%I
                    for each row execute function private.before_update_std()', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t);
  end loop;
end $$;

create trigger guard_document before update on public.payment_requests
  for each row execute function private.guard_document();
create trigger guard_document before update on public.cash_transactions
  for each row execute function private.guard_document();
create trigger guard_lines before insert or update or delete on public.cash_transaction_allocations
  for each row execute function private.guard_lines('cash_transactions', 'cash_transaction_id', 'DRAFT');

-- Переходы статусов (§4.5, §4.7) — дополняют каталог фазы 2.
create or replace function private.allowed_transition(p_table text, p_from text, p_to text) returns boolean
language sql immutable set search_path = '' as $$
  select (p_table, p_from, p_to) in (
    ('purchase_requests', 'DRAFT', 'ISSUED'), ('purchase_requests', 'DRAFT', 'CANCELLED'),
    ('purchase_requests', 'ISSUED', 'CANCELLED'),
    ('purchase_requests', 'ISSUED', 'PARTIALLY_RECEIVED'), ('purchase_requests', 'ISSUED', 'RECEIVED'),
    ('purchase_requests', 'PARTIALLY_RECEIVED', 'RECEIVED'), ('purchase_requests', 'PARTIALLY_RECEIVED', 'ISSUED'),
    ('purchase_requests', 'RECEIVED', 'PARTIALLY_RECEIVED'), ('purchase_requests', 'RECEIVED', 'ISSUED'),
    ('purchase_requests', 'PARTIALLY_RECEIVED', 'ACCOUNTING_REVIEW'),
    ('purchase_requests', 'RECEIVED', 'ACCOUNTING_REVIEW'),
    ('purchase_requests', 'ACCOUNTING_REVIEW', 'DISCREPANCY'),
    ('purchase_requests', 'DISCREPANCY', 'ACCOUNTING_REVIEW'),
    ('purchase_requests', 'ACCOUNTING_REVIEW', 'CLOSED'),
    ('supplier_invoices', 'ENTERED', 'UNDER_REVIEW'), ('supplier_invoices', 'UNDER_REVIEW', 'ENTERED'),
    ('supplier_invoices', 'UNDER_REVIEW', 'CONFIRMED'), ('supplier_invoices', 'ENTERED', 'CANCELLED'),
    ('supplier_invoices', 'UNDER_REVIEW', 'CANCELLED'), ('supplier_invoices', 'CONFIRMED', 'CANCELLED'),
    ('goods_receipts', 'DRAFT', 'POSTED'), ('goods_receipts', 'DRAFT', 'CORRECTION_APPROVAL'),
    ('goods_receipts', 'CORRECTION_APPROVAL', 'POSTED'), ('goods_receipts', 'CORRECTION_APPROVAL', 'DRAFT'),
    ('goods_receipts', 'POSTED', 'CORRECTED'),
    ('material_issues', 'DRAFT', 'POSTED'), ('material_issues', 'POSTED', 'REVERSED'),
    ('material_returns', 'DRAFT', 'POSTED'), ('material_returns', 'POSTED', 'REVERSED'),
    -- Счёт на оплату (§4.5): оплаты двигают статус в обе стороны (оплата / сторно оплаты).
    ('payment_requests', 'DRAFT', 'APPROVAL'), ('payment_requests', 'APPROVAL', 'APPROVED'),
    ('payment_requests', 'APPROVAL', 'DRAFT'),
    ('payment_requests', 'APPROVED', 'PARTIALLY_PAID'), ('payment_requests', 'APPROVED', 'PAID'),
    ('payment_requests', 'PARTIALLY_PAID', 'PAID'), ('payment_requests', 'PARTIALLY_PAID', 'APPROVED'),
    ('payment_requests', 'PAID', 'PARTIALLY_PAID'), ('payment_requests', 'PAID', 'APPROVED'),
    ('payment_requests', 'DRAFT', 'CANCELLED'), ('payment_requests', 'APPROVAL', 'CANCELLED'),
    ('payment_requests', 'APPROVED', 'CANCELLED'),
    -- Кассовая операция (§4.7)
    ('cash_transactions', 'DRAFT', 'POSTED'), ('cash_transactions', 'POSTED', 'REVERSED'),
    -- «Ввод остатков» (Д-61)
    ('opening_balances', 'DRAFT', 'POSTED'), ('opening_balances', 'POSTED', 'REVERSED')
  )
$$;

create or replace function private.document_prefix(p_doc_type public.document_type) returns text
language sql immutable set search_path = '' as $$
  select case p_doc_type::text
    when 'PURCHASE_REQUEST' then 'ЗК'
    when 'SUPPLIER_INVOICE' then 'НК'
    when 'GOODS_RECEIPT'    then 'ПРМ'
    when 'MATERIAL_ISSUE'   then 'ВДЧ'
    when 'MATERIAL_RETURN'  then 'ВЗВ'
    when 'PAYMENT_REQUEST'  then 'СЧ'
    when 'CASH_IN'          then 'ПКО'
    when 'CASH_OUT'         then 'РКО'
    when 'WORK_ACT'         then 'АКТ'
    when 'TASK'             then 'ЗД'
    when 'OPENING_BALANCE'  then 'ВО'
  end
$$;

-- -------------------------------------------------------------------------------------
-- 3. RLS (только чтение; запись — функциями, Д-58). У склада и прораба финансовых прав нет.
-- -------------------------------------------------------------------------------------
alter table public.cash_accounts                enable row level security;
alter table public.payment_requests             enable row level security;
alter table public.cash_transactions            enable row level security;
alter table public.cash_transaction_allocations enable row level security;

create policy cash_accounts_select on public.cash_accounts for select to authenticated
  using (private.has_permission(organization_id, 'cash.view')
         or private.has_permission(organization_id, 'cash_accounts.manage'));
create policy cash_transactions_select on public.cash_transactions for select to authenticated
  using (private.can(organization_id, project_id, 'cash.view'));
create policy cash_transaction_allocations_select on public.cash_transaction_allocations for select to authenticated
  using (private.has_permission(organization_id, 'cash.view'));
create policy payment_requests_select on public.payment_requests for select to authenticated
  using (private.can(organization_id, project_id, 'payment_requests.view'));

revoke all on public.cash_accounts, public.payment_requests, public.cash_transactions,
  public.cash_transaction_allocations from anon, authenticated;
grant select on public.cash_accounts, public.payment_requests, public.cash_transactions,
  public.cash_transaction_allocations to authenticated;
grant select, insert, update, delete on public.cash_accounts, public.payment_requests, public.cash_transactions,
  public.cash_transaction_allocations to service_role;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 4. Кэши: баланс кассы, оплачено по обязательству и по счёту на оплату (Д-62)
-- -------------------------------------------------------------------------------------
-- Изменение баланса с проверкой на минус (Д-19); строка кассы блокируется.
create function private.apply_cash_delta(p_account uuid, p_delta numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_acc public.cash_accounts;
begin
  select * into v_acc from public.cash_accounts where id = p_account for update;
  if v_acc.balance + p_delta < 0 then
    raise exception using errcode = 'P0001', message = 'BF_NEGATIVE_CASH',
      detail = jsonb_build_object('account', v_acc.name, 'balance', v_acc.balance, 'required', -p_delta,
                                  'currency', v_acc.currency)::text;
  end if;
  update public.cash_accounts set balance = v_acc.balance + p_delta where id = p_account;
end $$;

-- Оплачено = Σ распределений проведённых (не сторнированных) операций.
create function private.recalc_payable(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_paid numeric(18, 2);
begin
  select coalesce(sum(a.amount), 0) into v_paid
  from public.cash_transaction_allocations a join public.cash_transactions t on t.id = a.cash_transaction_id
  where a.payable_id = p_id and t.status = 'POSTED';
  update public.payables
     set paid_amount = v_paid,
         status = case when status = 'CANCELLED' then status
                       when v_paid = 0 then 'OPEN'::public.payable_status
                       when v_paid < amount then 'PARTIALLY_PAID'
                       else 'PAID' end
   where id = p_id;
end $$;

create function private.recalc_payment_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_paid numeric(18, 2);
begin
  select coalesce(sum(a.amount), 0) into v_paid
  from public.cash_transaction_allocations a join public.cash_transactions t on t.id = a.cash_transaction_id
  where a.payment_request_id = p_id and t.status = 'POSTED';
  perform private.begin_posting();
  update public.payment_requests
     set paid_amount = v_paid,
         status = case when status in ('DRAFT', 'APPROVAL', 'CANCELLED') then status
                       when v_paid = 0 then 'APPROVED'::public.payment_request_status
                       when v_paid < amount then 'PARTIALLY_PAID'
                       else 'PAID' end
   where id = p_id;
end $$;

-- Сверка (Д-62): возвращает только расхождения — пусто, если всё сходится. Баланс кассы = Σ проведённых
-- операций (включая начальные остатки и записи-сторно); оплачено = Σ распределений проведённых операций.
create function public.check_cash_consistency(p_org uuid)
returns table (entity text, id uuid, cached numeric, computed numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require(private.has_permission(p_org, 'cash.view') or private.has_permission(p_org, 'payables.view'),
                          'BF_FORBIDDEN', '42501');
  return query
    with all_rows as (
      select 'cash_account'::text as entity, a.id, a.balance::numeric as cached,
             coalesce((select sum(case when t.direction = 'IN' then t.amount else -t.amount end)
                       from public.cash_transactions t
                       where t.cash_account_id = a.id and t.status in ('POSTED', 'REVERSED')), 0)::numeric as computed
      from public.cash_accounts a where a.organization_id = p_org
      union all
      select 'payable', p.id, p.paid_amount::numeric,
             coalesce((select sum(x.amount) from public.cash_transaction_allocations x
                       join public.cash_transactions t on t.id = x.cash_transaction_id
                       where x.payable_id = p.id and t.status = 'POSTED'), 0)::numeric
      from public.payables p where p.organization_id = p_org
      union all
      select 'payment_request', r.id, r.paid_amount::numeric,
             coalesce((select sum(x.amount) from public.cash_transaction_allocations x
                       join public.cash_transactions t on t.id = x.cash_transaction_id
                       where x.payment_request_id = r.id and t.status = 'POSTED'), 0)::numeric
      from public.payment_requests r where r.organization_id = p_org
    )
    select r.entity, r.id, r.cached, r.computed from all_rows r where r.cached <> r.computed;
end $$;

-- -------------------------------------------------------------------------------------
-- 5. Кассы
-- -------------------------------------------------------------------------------------
create function public.save_cash_account(
  p_id uuid, p_org uuid, p_name text, p_kind public.cash_account_kind, p_currency text, p_bank_name text,
  p_account_number text, p_project_id uuid, p_is_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_acc public.cash_accounts;
begin
  perform private.require(private.has_permission(p_org, 'cash_accounts.manage'), 'BF_FORBIDDEN', '42501');
  select * into v_acc from public.cash_accounts where id = p_id for update;
  if found then
    perform private.require(v_acc.organization_id = p_org, 'BF_FORBIDDEN', '42501');
    -- Валюту кассы с операциями менять нельзя: баланс и история потеряли бы смысл.
    perform private.require(v_acc.currency = upper(p_currency) or not exists (
      select 1 from public.cash_transactions where cash_account_id = p_id and status <> 'DRAFT'), 'BF_ACCOUNT_HAS_OPERATIONS');
    update public.cash_accounts
       set name = trim(p_name), kind = p_kind, currency = upper(p_currency), bank_name = nullif(trim(p_bank_name), ''),
           account_number = nullif(trim(p_account_number), ''), project_id = p_project_id, is_active = p_is_active
     where id = p_id;
  else
    insert into public.cash_accounts (id, organization_id, name, kind, currency, bank_name, account_number,
      project_id, is_active)
    values (p_id, p_org, trim(p_name), p_kind, upper(p_currency), nullif(trim(p_bank_name), ''),
      nullif(trim(p_account_number), ''), p_project_id, p_is_active);
  end if;
  return p_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 6. Счёт на оплату (§4.5): прочие расходы, зарплаты, выплаты бригадам вне актов
-- -------------------------------------------------------------------------------------
create function public.save_payment_request_draft(
  p_id uuid, p_org uuid, p_project_id uuid, p_purpose public.payment_purpose, p_payee_crew_id uuid,
  p_payee_name text, p_amount numeric, p_currency text, p_basis text, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.payment_requests;
begin
  perform private.require(private.can(p_org, p_project_id, 'payment_requests.create'), 'BF_FORBIDDEN', '42501');
  select * into v_doc from public.payment_requests where id = p_id for update;
  if found then
    perform private.require(v_doc.organization_id = p_org, 'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    update public.payment_requests
       set project_id = p_project_id, purpose = p_purpose, payee_crew_id = p_payee_crew_id,
           payee_name = nullif(trim(p_payee_name), ''), amount = p_amount, currency = upper(p_currency),
           basis = nullif(trim(p_basis), ''), note = nullif(trim(p_note), '')
     where id = p_id;
  else
    insert into public.payment_requests (id, organization_id, project_id, purpose, payee_crew_id, payee_name, amount,
      currency, basis, note)
    values (p_id, p_org, p_project_id, p_purpose, p_payee_crew_id, nullif(trim(p_payee_name), ''), p_amount,
      upper(p_currency), nullif(trim(p_basis), ''), nullif(trim(p_note), ''));
  end if;
  return p_id;
end $$;

-- Кто согласует: прочие расходы — бухгалтер; зарплаты и выплаты вне актов — org_admin (TODO(TZ-open), Д-13).
create function private.payment_request_approver(p_purpose public.payment_purpose) returns text
language sql immutable set search_path = '' as $$
  select case when p_purpose = 'OTHER_EXPENSE' then 'payment_requests.approve' else 'payment_requests.approve_payroll' end
$$;

create function private.payment_request_transition(
  p_id uuid, p_key uuid, p_operation text, p_comment text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.payment_requests;
  v_cached jsonb;
  v_result jsonb;
  v_comment text := nullif(trim(p_comment), '');
  v_to public.payment_request_status;
  v_approval uuid;
  v_perm text;
begin
  select * into v_doc from public.payment_requests where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, p_operation, p_id);
  if v_cached is not null then return v_cached; end if;
  v_perm := private.payment_request_approver(v_doc.purpose);

  if p_operation = 'submit_payment_request' then
    perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'payment_requests.create'),
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
    v_to := 'APPROVAL';
  elsif p_operation in ('approve_payment_request', 'return_payment_request') then
    perform private.require(private.can(v_doc.organization_id, v_doc.project_id, v_perm), 'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'APPROVAL', 'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
    -- Д-14: согласовать собственный счёт нельзя (дублирует CHECK — понятное сообщение).
    perform private.require(v_doc.created_by is distinct from (select auth.uid()), 'BF_SELF_APPROVAL');
    if p_operation = 'return_payment_request' then
      v_comment := private.require_comment(p_comment);
      v_to := 'DRAFT';
    else
      v_to := 'APPROVED';
    end if;
  elsif p_operation = 'cancel_payment_request' then
    perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'payment_requests.create')
                            or private.can(v_doc.organization_id, v_doc.project_id, v_perm), 'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status in ('DRAFT', 'APPROVAL', 'APPROVED') and v_doc.paid_amount = 0,
                            'BF_INVALID_STATUS', 'P0001', v_doc.status::text);
    v_comment := private.require_comment(p_comment);
    v_to := 'CANCELLED';
  end if;

  perform private.begin_posting();
  update public.payment_requests
     set status = v_to,
         number = case when v_to = 'APPROVAL' and number is null
                       then private.next_document_number(organization_id, 'PAYMENT_REQUEST', doc_date) else number end,
         posted_at = case when v_to = 'APPROVAL' then now() else posted_at end,
         posted_by = case when v_to = 'APPROVAL' then (select auth.uid()) else posted_by end,
         approved_at = case when v_to = 'APPROVED' then now() else approved_at end,
         approved_by = case when v_to = 'APPROVED' then (select auth.uid()) else approved_by end,
         cancelled_at = case when v_to = 'CANCELLED' then now() else cancelled_at end,
         cancelled_by = case when v_to = 'CANCELLED' then (select auth.uid()) else cancelled_by end,
         cancel_reason = case when v_to = 'CANCELLED' then v_comment else cancel_reason end,
         status_comment = coalesce(v_comment, status_comment)
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  -- История согласования.
  if v_to = 'APPROVAL' then
    insert into public.approval_requests (organization_id, project_id, doc_type, doc_id, required_permission)
    values (v_doc.organization_id, v_doc.project_id, 'PAYMENT_REQUEST', p_id, v_perm) returning id into v_approval;
    insert into public.approval_actions (organization_id, approval_request_id, action, comment)
    values (v_doc.organization_id, v_approval, 'SUBMIT', v_doc.basis);
  elsif v_doc.status = 'APPROVAL' then
    select id into v_approval from public.approval_requests
    where doc_type = 'PAYMENT_REQUEST' and doc_id = p_id and status = 'PENDING' for update;
    update public.approval_requests
       set status = case v_to when 'APPROVED' then 'APPROVED'::public.approval_status
                              when 'DRAFT' then 'REJECTED' else 'CANCELLED' end,
           decided_at = now(), decided_by = (select auth.uid())
     where id = v_approval;
    insert into public.approval_actions (organization_id, approval_request_id, action, comment)
    values (v_doc.organization_id, v_approval,
            case v_to when 'APPROVED' then 'APPROVE'::public.approval_action when 'DRAFT' then 'RETURN' else 'CANCEL' end,
            v_comment);
  end if;

  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.submit_payment_request(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.payment_request_transition(p_id, p_key, 'submit_payment_request')
$$;
create function public.approve_payment_request(p_id uuid, p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select private.payment_request_transition(p_id, p_key, 'approve_payment_request')
$$;
create function public.return_payment_request(p_id uuid, p_key uuid, p_comment text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.payment_request_transition(p_id, p_key, 'return_payment_request', p_comment)
$$;
create function public.cancel_payment_request(p_id uuid, p_key uuid, p_reason text) returns jsonb
language sql security definer set search_path = '' as $$
  select private.payment_request_transition(p_id, p_key, 'cancel_payment_request', p_reason)
$$;

-- -------------------------------------------------------------------------------------
-- 7. Кассовая операция: черновик
-- -------------------------------------------------------------------------------------
-- p_allocations: [{payable_id | payment_request_id, amount}]. Валюта операции = валюта кассы.
create function public.save_cash_transaction_draft(
  p_id uuid, p_org uuid, p_cash_account_id uuid, p_direction public.cash_direction, p_category public.cash_category,
  p_amount numeric, p_project_id uuid, p_counterparty_supplier_id uuid, p_counterparty_crew_id uuid,
  p_counterparty_name text, p_basis text, p_note text, p_allocations jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.cash_transactions;
  v_currency char(3);
begin
  perform private.require(private.can(p_org, p_project_id, 'cash.post'), 'BF_FORBIDDEN', '42501');
  perform private.require(p_category <> 'OPENING_BALANCE', 'BF_FORBIDDEN', '42501');   -- только «Ввод остатков»
  select currency into v_currency from public.cash_accounts
  where id = p_cash_account_id and organization_id = p_org and is_active;
  perform private.require(v_currency is not null, 'BF_ACCOUNT_INACTIVE');

  select * into v_doc from public.cash_transactions where id = p_id for update;
  if found then
    perform private.require(v_doc.organization_id = p_org and v_doc.kind = 'REGULAR', 'BF_FORBIDDEN', '42501');
    perform private.require(v_doc.status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    update public.cash_transactions
       set cash_account_id = p_cash_account_id, direction = p_direction, category = p_category, amount = p_amount,
           currency = v_currency, project_id = p_project_id, counterparty_supplier_id = p_counterparty_supplier_id,
           counterparty_crew_id = p_counterparty_crew_id, counterparty_name = nullif(trim(p_counterparty_name), ''),
           basis = nullif(trim(p_basis), ''), note = nullif(trim(p_note), '')
     where id = p_id;
    delete from public.cash_transaction_allocations where cash_transaction_id = p_id;
  else
    insert into public.cash_transactions (id, organization_id, cash_account_id, direction, category, amount, currency,
      project_id, counterparty_supplier_id, counterparty_crew_id, counterparty_name, basis, note)
    values (p_id, p_org, p_cash_account_id, p_direction, p_category, p_amount, v_currency, p_project_id,
      p_counterparty_supplier_id, p_counterparty_crew_id, nullif(trim(p_counterparty_name), ''),
      nullif(trim(p_basis), ''), nullif(trim(p_note), ''));
  end if;

  insert into public.cash_transaction_allocations (organization_id, cash_transaction_id, payable_id,
    payment_request_id, amount)
  select p_org, p_id, nullif(a ->> 'payable_id', '')::uuid, nullif(a ->> 'payment_request_id', '')::uuid,
         (a ->> 'amount')::numeric
  from jsonb_array_elements(coalesce(p_allocations, '[]')) a
  where coalesce((a ->> 'amount')::numeric, 0) > 0;
  return p_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 8. Кассовая операция: проведение (§4.7). Порядок блокировок (Д-64): операция →
--    обязательства и счета (по id) → касса. Параллельные оплаты одного долга сериализуются.
-- -------------------------------------------------------------------------------------
-- Проверка распределений расхода: по каждой строке (по id) блокируем обязательство/счёт и сверяем остаток.
create function private.validate_and_lock_allocations(p_doc public.cash_transactions) returns void
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
      perform private.require(v_req.currency = p_doc.currency, 'BF_CURRENCY_MISMATCH');
      perform private.require(v_req.paid_amount + v_alloc.amount <= v_req.amount, 'BF_OVERPAYMENT', 'P0001',
        jsonb_build_object('remaining', v_req.amount - v_req.paid_amount, 'requested', v_alloc.amount,
                           'currency', v_req.currency)::text);
    end if;
  end loop;
end $$;

create function private.recalc_allocations_of(p_tx uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  for v_id in select payable_id from public.cash_transaction_allocations
              where cash_transaction_id = p_tx and payable_id is not null order by payable_id loop
    perform private.recalc_payable(v_id);
  end loop;
  for v_id in select payment_request_id from public.cash_transaction_allocations
              where cash_transaction_id = p_tx and payment_request_id is not null order by payment_request_id loop
    perform private.recalc_payment_request(v_id);
  end loop;
end $$;

create function public.post_cash_transaction(p_id uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.cash_transactions;
  v_cached jsonb;
  v_result jsonb;
begin
  select * into v_doc from public.cash_transactions where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'post_cash_transaction', p_id);
  if v_cached is not null then return v_cached; end if;

  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'cash.post'), 'BF_FORBIDDEN', '42501');
  perform private.require(v_doc.status = 'DRAFT' and v_doc.kind = 'REGULAR', 'BF_INVALID_STATUS', 'P0001',
                          v_doc.status::text);
  perform private.require(v_doc.direction <> 'OUT' or v_doc.category not in ('SUPPLIER')
                          or v_doc.counterparty_supplier_id is not null, 'BF_ALLOCATION_MISMATCH');

  -- 1) обязательства/счета (по id) → 2) касса: единый порядок блокировок (Д-64).
  perform private.validate_and_lock_allocations(v_doc);
  perform private.apply_cash_delta(v_doc.cash_account_id,
                                   case when v_doc.direction = 'IN' then v_doc.amount else -v_doc.amount end);

  perform private.begin_posting();
  update public.cash_transactions
     set status = 'POSTED',
         number = coalesce(number, private.next_document_number(organization_id,
           case when direction = 'IN' then 'CASH_IN'::public.document_type else 'CASH_OUT' end, doc_date)),
         posted_at = now(), posted_by = (select auth.uid())
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  perform private.recalc_allocations_of(p_id);
  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

-- -------------------------------------------------------------------------------------
-- 9. Сторно операции (§4.7, §6.3): запись противоположного направления со своим номером;
--    исходная → REVERSED, её распределения перестают учитываться — долги восстанавливаются.
-- -------------------------------------------------------------------------------------
create function private.reverse_cash_tx(p_doc public.cash_transactions, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_id2 uuid;
  v_dir public.cash_direction := case when p_doc.direction = 'IN' then 'OUT'::public.cash_direction else 'IN' end;
  v_number text;
begin
  -- Блокировки в том же порядке, что и при проведении: обязательства/счета → касса.
  for v_id in select payable_id from public.cash_transaction_allocations
              where cash_transaction_id = p_doc.id and payable_id is not null order by payable_id loop
    perform 1 from public.payables where id = v_id for update;
  end loop;
  for v_id2 in select payment_request_id from public.cash_transaction_allocations
               where cash_transaction_id = p_doc.id and payment_request_id is not null order by payment_request_id loop
    perform 1 from public.payment_requests where id = v_id2 for update;
  end loop;
  -- Сторно прихода — минус запрещён (Д-19): деньги могли уже потратить.
  perform private.apply_cash_delta(p_doc.cash_account_id,
                                   case when p_doc.direction = 'IN' then -p_doc.amount else p_doc.amount end);

  v_number := private.next_document_number(p_doc.organization_id,
                case when v_dir = 'IN' then 'CASH_IN'::public.document_type else 'CASH_OUT' end, private.today());
  insert into public.cash_transactions (organization_id, cash_account_id, kind, direction, category, amount,
    currency, project_id, counterparty_supplier_id, counterparty_crew_id, counterparty_name, basis,
    reversal_of_id, opening_balance_id, number, doc_date, status, posted_at, posted_by, note)
  values (p_doc.organization_id, p_doc.cash_account_id, 'REVERSAL', v_dir, p_doc.category, p_doc.amount,
    p_doc.currency, p_doc.project_id, p_doc.counterparty_supplier_id, p_doc.counterparty_crew_id,
    p_doc.counterparty_name, 'Сторно ' || coalesce(p_doc.number, 'операции') || ': ' || p_reason,
    p_doc.id, p_doc.opening_balance_id, v_number, private.today(), 'POSTED', now(), (select auth.uid()), p_reason);

  perform private.begin_posting();
  update public.cash_transactions
     set status = 'REVERSED', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = p_reason
   where id = p_doc.id;

  perform private.recalc_allocations_of(p_doc.id);
  return jsonb_build_object('id', p_doc.id, 'number', p_doc.number, 'status', 'REVERSED', 'reversal_number', v_number);
end $$;

create function public.reverse_cash_transaction(p_id uuid, p_key uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.cash_transactions;
  v_cached jsonb;
  v_result jsonb;
  v_reason text;
begin
  select * into v_doc from public.cash_transactions where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_doc.organization_id, p_key, 'reverse_cash_transaction', p_id);
  if v_cached is not null then return v_cached; end if;

  -- Кто вправе сторнировать — TODO(TZ-open); по умолчанию cash.reverse (кассир), Д-67.
  perform private.require(private.can(v_doc.organization_id, v_doc.project_id, 'cash.reverse'), 'BF_FORBIDDEN', '42501');
  -- Начальные остатки сторнируются только документом «Ввод остатков»; запись-сторно не сторнируется.
  perform private.require(v_doc.status = 'POSTED' and v_doc.kind = 'REGULAR', 'BF_INVALID_STATUS', 'P0001',
                          v_doc.status::text);
  v_reason := private.require_comment(p_reason);

  v_result := private.reverse_cash_tx(v_doc, v_reason);
  perform private.idempotency_finish(v_doc.organization_id, p_key, v_result);
  return v_result;
end $$;

-- Удаление черновика операции и счёта на оплату (номера у черновиков нет).
create function public.delete_finance_draft(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_project uuid;
  v_status text;
begin
  if p_kind = 'CASH_TRANSACTION' then
    select organization_id, project_id, status::text into v_org, v_project, v_status
    from public.cash_transactions where id = p_id and kind = 'REGULAR' for update;
    perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
    perform private.require(private.can(v_org, v_project, 'cash.post'), 'BF_FORBIDDEN', '42501');
    perform private.require(v_status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    delete from public.cash_transactions where id = p_id;
  elsif p_kind = 'PAYMENT_REQUEST' then
    select organization_id, project_id, status::text into v_org, v_project, v_status
    from public.payment_requests where id = p_id and number is null for update;
    perform private.require(v_org is not null, 'BF_NOT_FOUND', 'P0002');
    perform private.require(private.can(v_org, v_project, 'payment_requests.create'), 'BF_FORBIDDEN', '42501');
    perform private.require(v_status = 'DRAFT', 'BF_DOCUMENT_LOCKED');
    delete from public.payment_requests where id = p_id;
  else
    raise exception using errcode = 'P0002', message = 'BF_NOT_FOUND';
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 10. Гранты функций
-- -------------------------------------------------------------------------------------
revoke all on function private.apply_cash_delta(uuid, numeric), private.recalc_payable(uuid),
  private.recalc_payment_request(uuid), private.payment_request_approver(public.payment_purpose),
  private.payment_request_transition(uuid, uuid, text, text),
  private.validate_and_lock_allocations(public.cash_transactions), private.recalc_allocations_of(uuid),
  private.reverse_cash_tx(public.cash_transactions, text)
  from public, anon, authenticated;

revoke all on function public.check_cash_consistency(uuid),
  public.save_cash_account(uuid, uuid, text, public.cash_account_kind, text, text, text, uuid, boolean),
  public.save_payment_request_draft(uuid, uuid, uuid, public.payment_purpose, uuid, text, numeric, text, text, text),
  public.submit_payment_request(uuid, uuid), public.approve_payment_request(uuid, uuid),
  public.return_payment_request(uuid, uuid, text), public.cancel_payment_request(uuid, uuid, text),
  public.save_cash_transaction_draft(uuid, uuid, uuid, public.cash_direction, public.cash_category, numeric, uuid,
    uuid, uuid, text, text, text, jsonb),
  public.post_cash_transaction(uuid, uuid), public.reverse_cash_transaction(uuid, uuid, text),
  public.delete_finance_draft(text, uuid)
  from public, anon;
grant execute on function public.check_cash_consistency(uuid),
  public.save_cash_account(uuid, uuid, text, public.cash_account_kind, text, text, text, uuid, boolean),
  public.save_payment_request_draft(uuid, uuid, uuid, public.payment_purpose, uuid, text, numeric, text, text, text),
  public.submit_payment_request(uuid, uuid), public.approve_payment_request(uuid, uuid),
  public.return_payment_request(uuid, uuid, text), public.cancel_payment_request(uuid, uuid, text),
  public.save_cash_transaction_draft(uuid, uuid, uuid, public.cash_direction, public.cash_category, numeric, uuid,
    uuid, uuid, text, text, text, jsonb),
  public.post_cash_transaction(uuid, uuid), public.reverse_cash_transaction(uuid, uuid, text),
  public.delete_finance_draft(text, uuid)
  to authenticated;

-- ROLLBACK:
--   drop view public.payments;
--   drop table public.cash_transaction_allocations, public.cash_transactions, public.payment_requests,
--     public.cash_accounts cascade;
--   alter table public.payables drop column basis;
--   drop function (все функции этого файла); вернуть private.allowed_transition и private.document_prefix
--   из 20261014000000_posting_core.sql / 20261012010000_foundation.sql;
--   drop type public.payment_request_status, public.payment_purpose, public.cash_tx_status, public.cash_tx_kind,
--     public.cash_category, public.cash_direction, public.cash_account_kind;
