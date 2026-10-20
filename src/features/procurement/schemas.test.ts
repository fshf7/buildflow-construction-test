import { describe, expect, it } from "vitest";

import {
  expenseRowFields,
  listFiltersSchema,
  REQUEST_OPERATIONS,
  requestDraftSchema,
  requestOperationPermission,
} from "./schemas";

const id = "00000000-0000-4000-8000-000000000001";
const material = "00000000-0000-4000-8000-000000000002";

describe("заявка", () => {
  it("строка: материал и количество, без поставщика и цены (Д-92)", () => {
    const r = requestDraftSchema.safeParse({
      id,
      projectId: id,
      neededBy: "",
      currency: "TJS",
      note: "",
      lines: [{ materialId: material, quantity: "20", note: "" }],
    });
    expect(r.success).toBe(true);
    // Поставщик и цена, даже если их прислали, в данные заявки не попадают.
    const withExtra = requestDraftSchema.parse({
      id,
      projectId: id,
      neededBy: "",
      currency: "TJS",
      note: "",
      lines: [{ materialId: material, quantity: "20", note: "", supplierId: id, price: "1,5" }],
    });
    expect(withExtra.lines[0]).toEqual({ materialId: material, quantity: "20", note: "" });
  });
  it("пустая заявка не сохраняется", () => {
    const r = requestDraftSchema.safeParse({
      id,
      projectId: id,
      neededBy: "",
      currency: "TJS",
      note: "",
      lines: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("права на операции заявки (Д-92)", () => {
  it("выпуск и отмена — склад, остальное — сверка бухгалтера", () => {
    const byPermission = Object.groupBy(REQUEST_OPERATIONS, requestOperationPermission);
    expect(byPermission["purchase_requests.manage"]).toEqual([
      "issue_purchase_request",
      "cancel_purchase_request",
    ]);
    expect(byPermission["purchase_requests.review"]).toEqual([
      "start_purchase_review",
      "mark_purchase_discrepancy",
      "resolve_purchase_discrepancy",
      "close_purchase_request",
    ]);
  });
});

describe("строка затрат (Д-97)", () => {
  const row = {
    docDate: "2026-06-01",
    description: "Профиль 8*4",
    materialId: "",
    categoryId: id,
    quantity: "120",
    unitId: id,
    price: "32,00",
    currency: "TJS",
    supplierId: id,
    docNumber: "",
  };
  it("полная строка без № накладной — годится", () => {
    expect(expenseRowFields.safeParse(row).success).toBe(true);
  });
  it("без наименования, поставщика или с нулевой ценой — нет", () => {
    for (const bad of [
      { description: " " },
      { supplierId: "" },
      { price: "0" },
      { quantity: "-1" },
    ]) {
      expect(expenseRowFields.safeParse({ ...row, ...bad }).success).toBe(false);
    }
  });
});

describe("фильтры", () => {
  it("мусор в URL игнорируется", () => {
    expect(listFiltersSchema.parse({ project: "not-uuid", from: "вчера", q: "ЗК" })).toEqual({
      project: undefined,
      from: undefined,
      q: "ЗК",
    });
  });
});
