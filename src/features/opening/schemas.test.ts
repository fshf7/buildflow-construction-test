import { describe, expect, it } from "vitest";

import { openingSchema } from "./schemas";

const id = "00000000-0000-4000-8000-000000000001";

describe("ввод остатков", () => {
  it("долг — основание обязательно", () => {
    const r = openingSchema.safeParse({
      kind: "PAYABLES",
      id,
      docDate: "2026-10-01",
      projectId: "",
      note: "",
      lines: [
        { supplierId: id, projectId: "", amount: "5000", currency: "TJS", basis: "", dueDate: "" },
      ],
    });
    expect(r.success).toBe(false);
  });
  it("склад — без цен, только количества", () => {
    const r = openingSchema.safeParse({
      kind: "STOCK",
      id,
      docDate: "2026-10-01",
      projectId: id,
      note: "",
      lines: [{ materialId: id, quantity: "12,5" }],
    });
    expect(r.success).toBe(true);
  });
  it("касса — сумма до копеек", () => {
    const r = openingSchema.safeParse({
      kind: "CASH",
      id,
      docDate: "2026-10-01",
      projectId: "",
      note: "",
      lines: [{ accountId: id, amount: "1000,505" }],
    });
    expect(r.success).toBe(false);
  });
});
