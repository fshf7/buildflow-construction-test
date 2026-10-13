import { describe, expect, it } from "vitest";

import { invoiceDraftSchema, listFiltersSchema, requestDraftSchema } from "./schemas";

const id = "00000000-0000-4000-8000-000000000001";
const material = "00000000-0000-4000-8000-000000000002";

describe("заявка", () => {
  it("строка: материал и количество обязательны, поставщик и цена — к выдаче", () => {
    const r = requestDraftSchema.safeParse({
      id,
      projectId: id,
      neededBy: "",
      currency: "TJS",
      note: "",
      lines: [{ materialId: material, quantity: "20", supplierId: "", price: "", note: "" }],
    });
    expect(r.success).toBe(true);
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

describe("накладная", () => {
  it("строка услуги — описание и единица", () => {
    const base = {
      id,
      projectId: id,
      supplierId: id,
      purchaseRequestId: "",
      supplierDocNumber: "Н-1",
      supplierDocDate: "2026-10-10",
      currency: "TJS",
      note: "",
    };
    const service = {
      materialId: "",
      description: "Доставка",
      unitId: id,
      quantity: "1",
      price: "50",
      purchaseRequestItemId: "",
    };
    expect(invoiceDraftSchema.safeParse({ ...base, lines: [service] }).success).toBe(true);
    expect(
      invoiceDraftSchema.safeParse({ ...base, lines: [{ ...service, description: "" }] }).success,
    ).toBe(false);
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
