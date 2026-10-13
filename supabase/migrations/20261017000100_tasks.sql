-- =====================================================================================
-- 0012 Фаза 4: задачи (BP-06, §2.8, §4.8). Создаёт управляющий по своему объекту;
-- исполнители — склад, кассир, прораб; бухгалтер видит все. Переходы — функцией
-- change_task_status по каталогу private.allowed_transition (Д-58). Уведомлений нет (фаза 5).
-- =====================================================================================

create type public.task_priority as enum ('LOW', 'NORMAL', 'HIGH');

create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id),
  project_id         uuid not null,
  number             text,
  title              text not null check (length(trim(title)) between 3 and 200),
  description        text,
  assignee_member_id uuid not null,
  due_date           date,
  priority           public.task_priority not null default 'NORMAL',
  block_id           uuid,
  floor_id           uuid,
  status             public.task_status not null default 'NEW',
  blocked_reason     text,
  status_comment     text,
  completed_at       timestamptz,
  posted_at          timestamptz,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  updated_at         timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (assignee_member_id, organization_id) references public.organization_members (id, organization_id),
  foreign key (block_id, project_id) references public.blocks (id, project_id),
  foreign key (floor_id, block_id) references public.floors (id, block_id),
  -- Заблокированная задача всегда с причиной.
  check (status <> 'BLOCKED' or length(trim(blocked_reason)) >= 3),
  unique (id, organization_id, project_id)
);
create unique index tasks_number_key on public.tasks (organization_id, number) where number is not null;
create index on public.tasks (organization_id);
create index on public.tasks (project_id, status);
create index on public.tasks (assignee_member_id, status);

create table public.task_comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  task_id         uuid not null,
  body            text not null check (length(trim(body)) between 1 and 2000),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  foreign key (task_id, organization_id, project_id)
    references public.tasks (id, organization_id, project_id) on delete cascade
);
create index on public.task_comments (organization_id);
create index on public.task_comments (project_id);
create index on public.task_comments (task_id, created_at);
create trigger append_only before update or delete on public.task_comments
  for each row execute function private.forbid_change();

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'task_comments'] loop
    execute format('create trigger set_created_by before insert on public.%I
                    for each row execute function private.set_created_by()', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t);
  end loop;
end $$;
create trigger before_update_std before update on public.tasks
  for each row execute function private.before_update_std();
create trigger guard_document before update on public.tasks
  for each row execute function private.guard_document();

-- -------------------------------------------------------------------------------------
-- Видимость (Д-74): управляющий — задачи своих объектов (tasks.manage), бухгалтер — все
-- (tasks.view), исполнитель — только назначенные ему.
-- -------------------------------------------------------------------------------------
create function private.can_view_task(p_org uuid, p_project uuid, p_assignee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can(p_org, p_project, 'tasks.view')
      or private.can(p_org, p_project, 'tasks.manage')
      or (p_assignee = private.member_id(p_org) and private.has_permission(p_org, 'tasks.execute'))
$$;

alter table public.tasks         enable row level security;
alter table public.task_comments enable row level security;

create policy tasks_select on public.tasks for select to authenticated
  using (private.can_view_task(organization_id, project_id, assignee_member_id));
create policy task_comments_select on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

revoke all on public.tasks, public.task_comments from anon, authenticated;
grant select on public.tasks, public.task_comments to authenticated;
grant select, insert, update, delete on public.tasks, public.task_comments to service_role;

-- Вложения задач и актов — общий механизм document_attachments (doc_type TASK / WORK_ACT):
-- та же приватная корзина и политики Storage. task_attachments — представление (модель ТЗ §6).
create or replace function private.attachment_allowed(p_org uuid, p_doc_type text, p_doc_id uuid, p_write boolean)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_project uuid;
  v_task public.tasks;
  v_act public.work_completion_acts;
begin
  if p_doc_type = 'SUPPLIER_INVOICE' then
    select project_id into v_project from public.supplier_invoices where id = p_doc_id and organization_id = p_org;
    if v_project is null then return false; end if;
    return case when p_write then private.can(p_org, v_project, 'supplier_invoices.manage')
                else private.can(p_org, v_project, 'supplier_invoices.view')
                     and private.can(p_org, v_project, 'prices.view') end;
  elsif p_doc_type = 'GOODS_RECEIPT' then
    select project_id into v_project from public.goods_receipts where id = p_doc_id and organization_id = p_org;
    if v_project is null then return false; end if;
    return case when p_write then private.can(p_org, v_project, 'goods_receipts.post')
                else private.can(p_org, v_project, 'stock.view') end;
  elsif p_doc_type = 'TASK' then
    select * into v_task from public.tasks where id = p_doc_id and organization_id = p_org;
    if v_task.id is null then return false; end if;
    -- Фото и файлы добавляют участники задачи, пока она не закрыта.
    return private.can_view_task(p_org, v_task.project_id, v_task.assignee_member_id)
       and (not p_write or (v_task.status not in ('DONE', 'CANCELLED')
                            and (private.can(p_org, v_task.project_id, 'tasks.manage')
                                 or v_task.assignee_member_id = private.member_id(p_org))));
  elsif p_doc_type = 'WORK_ACT' then
    select * into v_act from public.work_completion_acts where id = p_doc_id and organization_id = p_org;
    if v_act.id is null then return false; end if;
    return case when p_write then v_act.status = 'DRAFT' and v_act.created_by = (select auth.uid())
                                  and private.can(p_org, v_act.project_id, 'work_acts.create')
                else private.can(p_org, v_act.project_id, 'work_acts.view')
                     or (v_act.status = 'APPROVED' and private.can(p_org, v_act.project_id, 'work_acts.view_approved'))
           end;
  end if;
  return false;
end $$;

create or replace function public.add_document_attachment(
  p_doc_type public.document_type, p_doc_id uuid, p_storage_path text, p_file_name text, p_mime_type text,
  p_size_bytes bigint
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_storage_path, '/');
  v_org uuid;
  v_project uuid;
  v_id uuid;
begin
  perform private.require(array_length(v_parts, 1) = 4 and v_parts[2] = p_doc_type::text
                          and v_parts[3] = p_doc_id::text, 'BF_FORBIDDEN', '42501');
  v_org := v_parts[1]::uuid;
  perform private.require(private.attachment_allowed(v_org, p_doc_type::text, p_doc_id, true), 'BF_FORBIDDEN', '42501');
  v_project := case p_doc_type
    when 'SUPPLIER_INVOICE' then (select project_id from public.supplier_invoices where id = p_doc_id)
    when 'GOODS_RECEIPT' then (select project_id from public.goods_receipts where id = p_doc_id)
    when 'TASK' then (select project_id from public.tasks where id = p_doc_id)
    when 'WORK_ACT' then (select project_id from public.work_completion_acts where id = p_doc_id) end;

  insert into public.document_attachments (organization_id, project_id, doc_type, doc_id, storage_path, file_name,
    mime_type, size_bytes)
  values (v_org, v_project, p_doc_type, p_doc_id, p_storage_path, p_file_name, p_mime_type, p_size_bytes)
  returning id into v_id;
  return v_id;
end $$;

create view public.task_attachments with (security_invoker = true) as
  select id, organization_id, project_id, doc_id as task_id, storage_path, file_name, mime_type, size_bytes,
         created_at, created_by
  from public.document_attachments where doc_type = 'TASK';
revoke all on public.task_attachments from anon, authenticated;
grant select on public.task_attachments to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- Функции
-- -------------------------------------------------------------------------------------
-- Исполнитель — активный участник с tasks.execute и доступом к объекту.
create function private.require_task_assignee(p_org uuid, p_project uuid, p_member uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require(exists (
    select 1 from public.organization_members m
    where m.id = p_member and m.organization_id = p_org and m.is_active
      and exists (select 1 from public.member_roles mr join public.permissions p on p.role_id = mr.role_id
                  where mr.member_id = m.id and p.code = 'tasks.execute')
      and (m.all_projects or exists (select 1 from public.project_members pm
                                     where pm.member_id = m.id and pm.project_id = p_project))
  ), 'BF_INVALID_ASSIGNEE');
end $$;

-- Создание и правка (до начала работы). Повтор с тем же p_id возвращает ту же задачу.
create function public.save_task(
  p_id uuid, p_project_id uuid, p_title text, p_description text, p_assignee_member_id uuid, p_due_date date,
  p_priority public.task_priority, p_block_id uuid, p_floor_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
  v_task public.tasks;
begin
  perform private.require(private.can(v_org, p_project_id, 'tasks.manage'), 'BF_FORBIDDEN', '42501');
  perform private.require_task_assignee(v_org, p_project_id, p_assignee_member_id);
  select * into v_task from public.tasks where id = p_id for update;
  if found then
    perform private.require(v_task.organization_id = v_org and v_task.project_id = p_project_id,
                            'BF_FORBIDDEN', '42501');
    perform private.require(v_task.status not in ('DONE', 'CANCELLED'), 'BF_DOCUMENT_LOCKED');
    update public.tasks
       set title = trim(p_title), description = nullif(trim(p_description), ''),
           assignee_member_id = p_assignee_member_id, due_date = p_due_date,
           priority = coalesce(p_priority, 'NORMAL'), block_id = p_block_id, floor_id = p_floor_id
     where id = p_id
    returning * into v_task;
  else
    perform private.begin_posting();
    insert into public.tasks (id, organization_id, project_id, number, title, description, assignee_member_id,
      due_date, priority, block_id, floor_id, posted_at)
    values (p_id, v_org, p_project_id, private.next_document_number(v_org, 'TASK', private.today()), trim(p_title),
      nullif(trim(p_description), ''), p_assignee_member_id, p_due_date, coalesce(p_priority, 'NORMAL'),
      p_block_id, p_floor_id, now())
    returning * into v_task;
  end if;
  return jsonb_build_object('id', v_task.id, 'number', v_task.number, 'status', v_task.status);
end $$;

-- Переходы (§4.8). Исполнитель: в работу, на проверку, заблокировать (причина), разблокировать.
-- Управляющий: выполнена, вернуть в работу, заблокировать/разблокировать, отменить (причина).
create function public.change_task_status(p_id uuid, p_key uuid, p_status public.task_status, p_comment text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_cached jsonb;
  v_result jsonb;
  v_comment text := nullif(trim(p_comment), '');
  v_manager boolean;
  v_executor boolean;
begin
  select * into v_task from public.tasks where id = p_id for update;
  perform private.require(found, 'BF_NOT_FOUND', 'P0002');
  v_cached := private.idempotency_begin(v_task.organization_id, p_key, 'change_task_status:' || p_status, p_id);
  if v_cached is not null then return v_cached; end if;

  v_manager := private.can(v_task.organization_id, v_task.project_id, 'tasks.manage');
  v_executor := v_task.assignee_member_id = private.member_id(v_task.organization_id)
                and private.has_permission(v_task.organization_id, 'tasks.execute');
  perform private.require(v_manager or v_executor, 'BF_FORBIDDEN', '42501');
  perform private.require(private.allowed_transition('tasks', v_task.status::text, p_status::text),
                          'BF_INVALID_TRANSITION', 'P0001', format('%s → %s', v_task.status, p_status));
  -- Решения управляющего: принять работу, вернуть с проверки, отменить.
  if p_status in ('DONE', 'CANCELLED') or (v_task.status = 'ON_REVIEW' and p_status = 'IN_PROGRESS') then
    perform private.require(v_manager, 'BF_FORBIDDEN', '42501');
  end if;
  if p_status in ('BLOCKED', 'CANCELLED') or (v_task.status = 'ON_REVIEW' and p_status = 'IN_PROGRESS') then
    v_comment := private.require_comment(p_comment);
  end if;

  perform private.begin_posting();
  update public.tasks
     set status = p_status,
         blocked_reason = case when p_status = 'BLOCKED' then v_comment else null end,
         completed_at = case when p_status = 'DONE' then now() else null end,
         status_comment = coalesce(v_comment, status_comment)
   where id = p_id
  returning jsonb_build_object('id', id, 'number', number, 'status', status) into v_result;

  -- Причина перехода видна в обсуждении задачи.
  if v_comment is not null then
    insert into public.task_comments (organization_id, project_id, task_id, body)
    values (v_task.organization_id, v_task.project_id, p_id, v_comment);
  end if;

  perform private.idempotency_finish(v_task.organization_id, p_key, v_result);
  return v_result;
end $$;

create function public.add_task_comment(p_task_id uuid, p_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  perform private.require(found and private.can_view_task(v_task.organization_id, v_task.project_id,
                                                           v_task.assignee_member_id), 'BF_FORBIDDEN', '42501');
  -- Повтор с тем же p_id не создаёт дубль.
  insert into public.task_comments (id, organization_id, project_id, task_id, body)
  values (p_id, v_task.organization_id, v_task.project_id, p_task_id, trim(p_body))
  on conflict (id) do nothing;
  return p_id;
end $$;

-- Исполнители объекта для формы задачи (список участников клиенту закрыт RLS).
create function public.task_assignees(p_project_id uuid)
returns table (member_id uuid, full_name text, roles text[])
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := private.project_org(p_project_id);
begin
  perform private.require(private.can(v_org, p_project_id, 'tasks.manage'), 'BF_FORBIDDEN', '42501');
  return query
    select m.id, m.full_name,
           array(select r.name from public.member_roles mr join public.roles r on r.id = mr.role_id
                 where mr.member_id = m.id order by r.name)
    from public.organization_members m
    where m.organization_id = v_org and m.is_active
      and exists (select 1 from public.member_roles mr join public.permissions p on p.role_id = mr.role_id
                  where mr.member_id = m.id and p.code = 'tasks.execute')
      and (m.all_projects or exists (select 1 from public.project_members pm
                                     where pm.member_id = m.id and pm.project_id = p_project_id))
    order by m.full_name;
end $$;

revoke all on function private.can_view_task(uuid, uuid, uuid), private.require_task_assignee(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_view_task(uuid, uuid, uuid) to authenticated;   -- нужна политикам RLS

revoke all on function
  public.save_task(uuid, uuid, text, text, uuid, date, public.task_priority, uuid, uuid),
  public.change_task_status(uuid, uuid, public.task_status, text),
  public.add_task_comment(uuid, uuid, text), public.task_assignees(uuid)
  from public, anon;
grant execute on function
  public.save_task(uuid, uuid, text, text, uuid, date, public.task_priority, uuid, uuid),
  public.change_task_status(uuid, uuid, public.task_status, text),
  public.add_task_comment(uuid, uuid, text), public.task_assignees(uuid)
  to authenticated;

-- ROLLBACK:
--   drop view public.task_attachments;
--   drop table public.task_comments, public.tasks cascade; drop type public.task_priority;
--   вернуть private.attachment_allowed и public.add_document_attachment из 20261014000200_warehouse.sql;
--   drop function (все функции этого файла).
