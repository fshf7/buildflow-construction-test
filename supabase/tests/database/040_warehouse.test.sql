-- Склад: US-02…US-04, идемпотентность, минус, сторно, корректировки (Д-06, Д-19, Д-21, Д-52, Д-53).
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);
-- ---- Общая фикстура фазы 2 (одинакова в 030/040/050) ----
create function pg_temp.mk_user(p_email text) returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          p_email, '', now(), '{}', '{}', now(), now())
  returning id
$$;

-- Вход: настоящая сессия + session_id в JWT (Д-47).
create function pg_temp.login(p_user uuid, p_aal text default 'aal1') returns void language plpgsql as $$
declare
  v_session uuid := gen_random_uuid();
begin
  execute 'reset role';
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  values (v_session, p_user, now(), now(), p_aal::auth.aal_level);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'session_id', v_session)::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Текст detail ошибки (для проверки «ошибка показывает текущий остаток»).
create function pg_temp.err_detail(p_sql text) returns jsonb language plpgsql as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end $$;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;

insert into ids values
  ('admin', pg_temp.mk_user('admin@t.local')), ('acc', pg_temp.mk_user('acc@t.local')),
  ('wh', pg_temp.mk_user('wh@t.local')), ('foreman', pg_temp.mk_user('foreman@t.local')),
  ('foreman2', pg_temp.mk_user('foreman2@t.local')), ('pm', pg_temp.mk_user('pm@t.local'));
insert into ids select 'org', public.create_organization('Стройка', pg_temp.id('admin'), 'Админ', 'admin@t.local');

-- Участники и объект (как администратор со вторым фактором).
select pg_temp.login(pg_temp.id('admin'), 'aal2');
insert into public.projects (organization_id, code, name) values (pg_temp.id('org'), 'P1', 'ЖК Восток');
insert into ids select 'p1', id from public.projects where code = 'P1';
insert into public.blocks (organization_id, project_id, name) values (pg_temp.id('org'), pg_temp.id('p1'), 'Блок А');
insert into ids select 'block', id from public.blocks where name = 'Блок А';
insert into public.floors (organization_id, project_id, block_id, name)
  values (pg_temp.id('org'), pg_temp.id('p1'), pg_temp.id('block'), '1');
insert into ids select 'floor', id from public.floors where name = '1';
select public.add_member(pg_temp.id('org'), pg_temp.id('acc'), 'acc@t.local', 'Бухгалтер', array['accountant'], true, '{}');
select public.add_member(pg_temp.id('org'), pg_temp.id('wh'), 'wh@t.local', 'Склад', array['warehouse'], false,
  array[pg_temp.id('p1')]);
select public.add_member(pg_temp.id('org'), pg_temp.id('foreman'), 'foreman@t.local', 'Прораб', array['foreman'], false,
  array[pg_temp.id('p1')]);
select public.add_member(pg_temp.id('org'), pg_temp.id('foreman2'), 'foreman2@t.local', 'Прораб 2', array['foreman'],
  false, array[pg_temp.id('p1')]);
select public.add_member(pg_temp.id('org'), pg_temp.id('pm'), 'pm@t.local', 'Управляющий', array['project_manager'],
  false, array[pg_temp.id('p1')]);
insert into ids select 'kg', id from public.units_of_measure where code = 'кг' and organization_id = pg_temp.id('org');
insert into ids select 'bag', id from public.units_of_measure where code = 'меш' and organization_id = pg_temp.id('org');
select pg_temp.logout();

-- Справочники (как бухгалтер) и бригада (как прораб — crews.manage).
select pg_temp.login(pg_temp.id('acc'), 'aal2');
insert into public.materials (organization_id, name, unit_id) values
  (pg_temp.id('org'), 'Цемент', pg_temp.id('kg')), (pg_temp.id('org'), 'Песок', pg_temp.id('kg')),
  (pg_temp.id('org'), 'Гипс', pg_temp.id('kg'));
insert into ids select 'cement', id from public.materials where name = 'Цемент';
insert into ids select 'sand', id from public.materials where name = 'Песок';
insert into ids select 'gypsum', id from public.materials where name = 'Гипс';
insert into public.suppliers (organization_id, name) values (pg_temp.id('org'), 'ООО Цемент'), (pg_temp.id('org'), 'ООО Песок');
insert into ids select 's1', id from public.suppliers where name = 'ООО Цемент';
insert into ids select 's2', id from public.suppliers where name = 'ООО Песок';
select pg_temp.logout();

select pg_temp.login(pg_temp.id('foreman'));
insert into public.crews (organization_id, name, foreman_member_id)
  select pg_temp.id('org'), 'Бригада Каримова', m.id from public.organization_members m
  where m.user_id = pg_temp.id('foreman');
insert into ids select 'crew', id from public.crews where name = 'Бригада Каримова';
select pg_temp.logout();

-- Заявка: цемент 20 кг у S1 по 1.5, песок 10 кг у S2 по 0.8 — выдана в работу.
select pg_temp.login(pg_temp.id('acc'), 'aal2');
insert into ids values ('req', gen_random_uuid());
select public.save_purchase_request_draft(pg_temp.id('req'), pg_temp.id('p1'), null, 'TJS', null,
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 20, 'supplier_id', pg_temp.id('s1'), 'price', 1.5),
    jsonb_build_object('material_id', pg_temp.id('sand'), 'quantity', 10, 'supplier_id', pg_temp.id('s2'), 'price', 0.8)));
insert into ids select 'req_cement', id from public.purchase_request_items where material_id = pg_temp.id('cement');
insert into ids select 'req_sand', id from public.purchase_request_items where material_id = pg_temp.id('sand');
select pg_temp.logout();
-- ---- конец фикстуры ----
-- Заявка в работу.
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select public.issue_purchase_request(pg_temp.id('req'), gen_random_uuid());
select pg_temp.logout();

create function pg_temp.balance(p_material text) returns numeric language sql as $$
  select coalesce((select quantity from public.stock_balances where material_id = pg_temp.id(p_material)), 0)
$$;

-- ===== US-02: заказано 20, принято 21 =====
select pg_temp.login(pg_temp.id('wh'));
insert into ids values ('gr1', gen_random_uuid()), ('k1', gen_random_uuid());
select public.save_goods_receipt_draft(pg_temp.id('gr1'), pg_temp.id('p1'), pg_temp.id('s1'), pg_temp.id('req'), null, null,
  jsonb_build_array(jsonb_build_object('purchase_request_item_id', pg_temp.id('req_cement'), 'received_quantity', 21)));
select is(public.post_goods_receipt(pg_temp.id('gr1'), pg_temp.id('k1')) ->> 'status', 'POSTED', 'приёмка проведена');
select results_eq($$ select ordered_quantity, received_quantity from public.goods_receipt_items
                     where goods_receipt_id = pg_temp.id('gr1') $$,
  $$ values (20::numeric(18,4), 21::numeric(18,4)) $$, 'US-02: хранятся оба количества — заказано 20, принято 21');
select is(pg_temp.balance('cement'), 21::numeric, 'US-02: остаток +21');
select is((select count(*)::int from public.stock_movements where source_doc_id = pg_temp.id('gr1')), 1,
  'US-02: ровно одно движение');
-- Повтор с тем же ключом (двойной тап, ретрай сети) — тот же ответ, остаток не меняется.
select is(public.post_goods_receipt(pg_temp.id('gr1'), pg_temp.id('k1')) ->> 'status', 'POSTED',
  'повтор с тем же ключом возвращает сохранённый ответ');
select is(pg_temp.balance('cement'), 21::numeric, 'повтор с тем же ключом не меняет остаток');
select throws_ok($$ select public.post_goods_receipt(pg_temp.id('gr1'), gen_random_uuid()) $$,
  'P0001', 'BF_INVALID_STATUS', 'повтор с новым ключом отклонён');
select is(pg_temp.balance('cement'), 21::numeric, '…и остаток прежний: +21 ровно один раз');
select throws_ok($$ select public.post_goods_receipt(pg_temp.id('gr1'), pg_temp.id('k1')) from (select 1) x
                    where public.issue_purchase_request(pg_temp.id('req'), pg_temp.id('k1')) is not null $$,
  'P0001', 'BF_IDEMPOTENCY_KEY_REUSED', 'ключ одной операции нельзя использовать для другой');
select pg_temp.logout();

select pg_temp.login(pg_temp.id('acc'), 'aal2');
select results_eq($$ select status::text, has_discrepancy from public.purchase_requests where id = pg_temp.id('req') $$,
  $$ values ('PARTIALLY_RECEIVED', true) $$, 'заявка частично получена; излишек помечен расхождением (Д-53)');
select results_eq($$ select ordered, received, diff from public.purchase_request_fulfillment
                     where purchase_request_item_id = pg_temp.id('req_cement') $$,
  $$ values (20::numeric, 21::numeric, 1::numeric) $$, 'расхождение по строке хранится отдельно: +1');
select pg_temp.logout();

select pg_temp.login(pg_temp.id('wh'));
insert into ids values ('gr2', gen_random_uuid());
select public.save_goods_receipt_draft(pg_temp.id('gr2'), pg_temp.id('p1'), pg_temp.id('s2'), pg_temp.id('req'), null, null,
  jsonb_build_array(jsonb_build_object('purchase_request_item_id', pg_temp.id('req_sand'), 'received_quantity', 10)));
select public.post_goods_receipt(pg_temp.id('gr2'), gen_random_uuid());
select is((select status::text from public.purchase_requests where id = pg_temp.id('req')), 'RECEIVED',
  'вся заявка получена');
-- Строку чужого поставщика в приёмку не включить.
insert into ids values ('gr_bad', gen_random_uuid());
select public.save_goods_receipt_draft(pg_temp.id('gr_bad'), pg_temp.id('p1'), pg_temp.id('s2'), pg_temp.id('req'), null, null,
  jsonb_build_array(jsonb_build_object('purchase_request_item_id', pg_temp.id('req_cement'), 'received_quantity', 1)));
select throws_ok($$ select public.post_goods_receipt(pg_temp.id('gr_bad'), gen_random_uuid()) $$,
  'P0001', 'BF_LINE_MISMATCH', 'строка заявки другого поставщика не принимается');
select lives_ok($$ select public.delete_document_draft('GOODS_RECEIPT', pg_temp.id('gr_bad')) $$, 'черновик удаляется');

-- ===== US-03: выдача бригаде =====
insert into ids values ('mi1', gen_random_uuid());
select public.save_material_issue_draft(pg_temp.id('mi1'), pg_temp.id('p1'), pg_temp.id('block'), pg_temp.id('floor'),
  pg_temp.id('crew'), 'Каримов', null, jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 15)));
select is(public.post_material_issue(pg_temp.id('mi1'), gen_random_uuid()) ->> 'status', 'POSTED', 'выдача проведена');
select results_eq($$ select project_id, block_id, floor_id, crew_id from public.material_issues where id = pg_temp.id('mi1') $$,
  $$ values (pg_temp.id('p1'), pg_temp.id('block'), pg_temp.id('floor'), pg_temp.id('crew')) $$,
  'US-03: объект, блок, этаж, бригада зафиксированы');
select is(pg_temp.balance('cement'), 6::numeric, 'US-03: остаток уменьшился: 21 − 15 = 6');

-- Минус запрещён (Д-19), ошибка показывает текущий остаток.
insert into ids values ('mi2', gen_random_uuid());
select public.save_material_issue_draft(pg_temp.id('mi2'), pg_temp.id('p1'), pg_temp.id('block'), pg_temp.id('floor'),
  pg_temp.id('crew'), null, null, jsonb_build_array(jsonb_build_object('material_id', pg_temp.id('cement'), 'quantity', 10)));
select throws_ok($$ select public.post_material_issue(pg_temp.id('mi2'), gen_random_uuid()) $$,
  'P0001', 'BF_NEGATIVE_STOCK', 'выдача больше остатка запрещена');
select is(pg_temp.err_detail($$ select public.post_material_issue(pg_temp.id('mi2'), gen_random_uuid()) $$),
  '{"material": "Цемент", "unit": "кг", "available": 6.0000, "required": 10.0000}'::jsonb,
  'ошибка показывает текущий остаток: есть 6, нужно 10');
select is(pg_temp.balance('cement'), 6::numeric, 'после отказа остаток не изменился');
select is((select status::text from public.material_issues where id = pg_temp.id('mi2')), 'DRAFT',
  'отклонённая выдача осталась черновиком');
-- Этаж из другого блока не подходит.
select throws_ok($$ select public.save_material_issue_draft(gen_random_uuid(), pg_temp.id('p1'), pg_temp.id('block'),
    gen_random_uuid(), pg_temp.id('crew'), null, null, '[]') $$, '23503', null, 'этаж должен принадлежать блоку объекта');

-- ===== US-04: возврат связан с выдачей =====
insert into ids values ('mr1', gen_random_uuid());
select public.save_material_return_draft(pg_temp.id('mr1'), pg_temp.id('mi1'), null,
  jsonb_build_array(jsonb_build_object('material_issue_item_id',
    (select id from public.material_issue_items where material_issue_id = pg_temp.id('mi1')), 'quantity', 5)));
select is(public.post_material_return(pg_temp.id('mr1'), gen_random_uuid()) ->> 'status', 'POSTED', 'возврат проведён');
select is(pg_temp.balance('cement'), 11::numeric, 'US-04: остаток увеличился: 6 + 5 = 11');
select is((select material_issue_id from public.material_returns where id = pg_temp.id('mr1')), pg_temp.id('mi1'),
  'US-04: возврат связан с выдачей');
insert into ids values ('mr2', gen_random_uuid());
select public.save_material_return_draft(pg_temp.id('mr2'), pg_temp.id('mi1'), null,
  jsonb_build_array(jsonb_build_object('material_issue_item_id',
    (select id from public.material_issue_items where material_issue_id = pg_temp.id('mi1')), 'quantity', 11)));
select throws_ok($$ select public.post_material_return(pg_temp.id('mr2'), gen_random_uuid()) $$,
  'P0001', 'BF_RETURN_EXCEEDS_ISSUED', 'вернуть больше выданного нельзя (5 + 11 > 15)');

-- ===== Сторно =====
select throws_ok($$ select public.reverse_material_issue(pg_temp.id('mi1'), gen_random_uuid(), 'Ошибка') $$,
  'P0001', 'BF_HAS_RETURNS', 'выдачу с возвратами сразу не сторнировать');
select is(public.reverse_material_return(pg_temp.id('mr1'), gen_random_uuid(), 'Ошибка ввода') ->> 'status', 'REVERSED',
  'возврат сторнирован');
select is(pg_temp.balance('cement'), 6::numeric, 'сторно возврата: 11 − 5 = 6');
select throws_ok($$ select public.reverse_material_issue(pg_temp.id('mi1'), gen_random_uuid(), '') $$,
  'P0001', 'BF_REASON_REQUIRED', 'сторно без причины невозможно');
select is(public.reverse_material_issue(pg_temp.id('mi1'), gen_random_uuid(), 'Ошибка ввода') ->> 'status', 'REVERSED',
  'выдача сторнирована');
select is(pg_temp.balance('cement'), 21::numeric, 'сторно выдачи: 6 + 15 = 21');
select is((select count(*)::int from public.stock_movements where source_doc_id = pg_temp.id('mi1')), 2,
  'проведённое не удаляется: движение и его сторно');

-- ===== Корректировка приёмки до сверки — склад сам (Д-06) =====
insert into ids values ('gr1c', gen_random_uuid());
select public.create_receipt_correction(pg_temp.id('gr1'), pg_temp.id('gr1c'), 'Пересчитали: 20 кг', true);
select public.save_goods_receipt_draft(pg_temp.id('gr1c'), pg_temp.id('p1'), null, null, null, null,
  jsonb_build_array(jsonb_build_object('purchase_request_item_id', pg_temp.id('req_cement'), 'received_quantity', 20)));
select is(public.post_goods_receipt(pg_temp.id('gr1c'), gen_random_uuid()) ->> 'status', 'POSTED',
  'корректировка до сверки проведена складом');
select is((select status::text from public.goods_receipts where id = pg_temp.id('gr1')), 'CORRECTED',
  'исходная приёмка — «корректировка»');
select is(pg_temp.balance('cement'), 20::numeric, 'остаток 21 → 20');
select pg_temp.logout();

-- ===== После начала сверки — только через бухгалтера =====
select pg_temp.login(pg_temp.id('acc'), 'aal2');
select is(public.start_purchase_review(pg_temp.id('req'), gen_random_uuid()) ->> 'status', 'ACCOUNTING_REVIEW',
  'бухгалтер начал сверку');
select pg_temp.logout();

select pg_temp.login(pg_temp.id('wh'));
insert into ids values ('gr2c', gen_random_uuid());
-- Д-52: сторно приёмки песка = корректировка до нуля строк.
select public.create_receipt_correction(pg_temp.id('gr2'), pg_temp.id('gr2c'), 'Песок вернули поставщику', false);
select throws_ok($$ select public.post_goods_receipt(pg_temp.id('gr2c'), gen_random_uuid()) $$,
  'P0001', 'BF_CORRECTION_NEEDS_APPROVAL', 'после начала сверки склад сам не проводит корректировку');
select is(public.submit_receipt_correction(pg_temp.id('gr2c'), gen_random_uuid()) ->> 'status', 'CORRECTION_APPROVAL',
  'корректировка отправлена бухгалтеру');
select throws_ok($$ select public.approve_receipt_correction(pg_temp.id('gr2c'), gen_random_uuid(), null) $$,
  '42501', 'BF_FORBIDDEN', 'склад не согласует корректировки');
select pg_temp.logout();

select pg_temp.login(pg_temp.id('acc'), 'aal2');
select throws_ok($$ select public.return_receipt_correction(pg_temp.id('gr2c'), gen_random_uuid(), '') $$,
  'P0001', 'BF_REASON_REQUIRED', 'возврат на доработку — только с комментарием');
select is(public.approve_receipt_correction(pg_temp.id('gr2c'), gen_random_uuid(), 'Ок') ->> 'status', 'POSTED',
  'бухгалтер согласовал — корректировка проведена');
select is(pg_temp.balance('sand'), 0::numeric, 'сторно приёмки песка: остаток 0');
select is((select status::text from public.approval_requests where doc_id = pg_temp.id('gr2c')), 'APPROVED',
  'история согласования сохранена');
select is((select status::text from public.purchase_requests where id = pg_temp.id('req')), 'ACCOUNTING_REVIEW',
  'статус сверки не меняется автоматически');

-- ===== Остаток = Σ движений (сверка) =====
select is_empty($$ select * from public.check_stock_consistency(pg_temp.id('org')) $$,
  'остатки совпадают с суммой движений');
select is(pg_temp.balance('cement'), (select sum(quantity) from public.stock_movements where material_id = pg_temp.id('cement')),
  'цемент: остаток = Σ движений');

-- ===== Д-21: единицу материала с движениями не сменить =====
select throws_ok($$ update public.materials set unit_id = pg_temp.id('bag') where id = pg_temp.id('cement') $$,
  'P0001', 'BF_UNIT_LOCKED', 'Д-21: у материала с движениями единица не меняется');
select lives_ok($$ update public.materials set unit_id = pg_temp.id('bag') where id = pg_temp.id('gypsum') $$,
  'у материала без движений — меняется');
select pg_temp.logout();

-- ===== Прочие запреты =====
select pg_temp.login(pg_temp.id('wh'));
select throws_ok($$ insert into public.stock_movements (organization_id, project_id, warehouse_id, material_id, unit_id,
    quantity, movement_type, source_doc_type, source_doc_id, occurred_on)
    select organization_id, project_id, warehouse_id, material_id, pg_temp.id('kg'), 100, 'RECEIPT', 'GOODS_RECEIPT',
           gen_random_uuid(), current_date from public.stock_balances limit 1 $$,
  '42501', null, 'движения напрямую не пишутся');
select throws_ok($$ update public.stock_balances set quantity = 1000 $$, '42501', null, 'остатки напрямую не меняются');
select pg_temp.logout();

-- Прораб видит выдачи своей бригады, но не остатки; чужой прораб — ничего.
select pg_temp.login(pg_temp.id('foreman'));
select is((select count(*)::int from public.material_issues), 2, 'прораб видит выдачи своей бригады (Д-26)');
select is((select count(*)::int from public.stock_balances), 0, 'прораб не видит остатки склада');
select pg_temp.logout();
select pg_temp.login(pg_temp.id('foreman2'));
select is((select count(*)::int from public.material_issues), 0, 'чужой прораб не видит выдачи');
select pg_temp.logout();

select * from finish();
rollback;
