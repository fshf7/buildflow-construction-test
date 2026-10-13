import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createFixture, must, service, type Fixture } from "./setup";

// «Склад не видит цен ни в одном API» (§5.4): REST-выборки, встраивание связей, витрины, хранилище.
let fx: Fixture;
let requestId: string;
let invoiceId: string;
let scanPath: string;

beforeAll(async () => {
  fx = await createFixture("prices");
  requestId = randomUUID();
  invoiceId = randomUUID();

  // Данные с ценами — напрямую service_role (черновики: ограничения статусов это допускают).
  must(
    await service
      .from("purchase_requests")
      .insert({
        id: requestId,
        organization_id: fx.orgId,
        project_id: fx.projectId,
        warehouse_id: fx.warehouseId,
      })
      .select("id"),
  );
  must(
    await service
      .from("purchase_request_items")
      .insert({
        organization_id: fx.orgId,
        project_id: fx.projectId,
        purchase_request_id: requestId,
        line_no: 1,
        material_id: fx.materialId,
        unit_id: fx.materialId, // заменяется триггером на единицу материала
        quantity: 10,
        supplier_id: fx.supplierId,
        price: 123.45,
      })
      .select("id"),
  );
  must(
    await service
      .from("supplier_invoices")
      .insert({
        id: invoiceId,
        organization_id: fx.orgId,
        project_id: fx.projectId,
        supplier_id: fx.supplierId,
        supplier_doc_number: `IT-${invoiceId.slice(0, 8)}`,
        supplier_doc_date: "2026-10-10",
      })
      .select("id"),
  );
  scanPath = `${fx.orgId}/SUPPLIER_INVOICE/${invoiceId}/scan.pdf`;
  const upload = await service.storage
    .from("documents")
    .upload(scanPath, new Blob(["%PDF-1.4 цена 123.45"], { type: "application/pdf" }));
  if (upload.error) throw upload.error;
});

describe("склад и цены через API", () => {
  it("колонки цен в выборке — ошибка доступа", async () => {
    for (const select of ["price", "amount", "*", "id, price"]) {
      const { data, error } = await fx.storekeeper.from("purchase_request_items").select(select);
      expect(error, `select=${select}`).not.toBeNull();
      expect(data).toBeNull();
    }
    const total = await fx.storekeeper.from("supplier_invoices").select("total_amount");
    expect(total.error).not.toBeNull();
  });

  it("встраивание строк с ценами в заявку — ошибка доступа", async () => {
    const { error } = await fx.storekeeper
      .from("purchase_requests")
      .select("id, purchase_request_items(price)")
      .eq("id", requestId);
    expect(error).not.toBeNull();
  });

  it("фильтр по цене (подбор перебором) — ошибка доступа", async () => {
    const { error } = await fx.storekeeper
      .from("purchase_request_items")
      .select("id")
      .gt("price", 100);
    expect(error).not.toBeNull();
  });

  it("без цен — данные доступны", async () => {
    const { data, error } = await fx.storekeeper
      .from("purchase_request_items")
      .select("id, quantity")
      .eq("purchase_request_id", requestId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("витрины цен, аудит, обязательства — пусто", async () => {
    for (const table of [
      "purchase_request_items_priced",
      "supplier_invoices_priced",
      "supplier_invoice_items_priced",
      "audit_logs",
      "payables",
    ] as const) {
      // Таблицы и представления в типах разделены — здесь важен только ответ API.
      const { data, error } = await (
        fx.storekeeper.from as (t: string) => ReturnType<typeof fx.storekeeper.from>
      )(table).select("*");
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it("скан накладной в хранилище — недоступен", async () => {
    const download = await fx.storekeeper.storage.from("documents").download(scanPath);
    expect(download.data).toBeNull();
    const list = await fx.storekeeper.storage
      .from("documents")
      .list(`${fx.orgId}/SUPPLIER_INVOICE/${invoiceId}`);
    expect(list.data ?? []).toEqual([]);
    const signed = await fx.storekeeper.storage.from("documents").createSignedUrl(scanPath, 60);
    expect(signed.data).toBeNull();
  });
});
