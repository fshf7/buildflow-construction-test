import { describe, expect, it } from "vitest";

import { money, paymentRequestSchema, quickCashSchema } from "./schemas";

describe("деньги", () => {
  it("до двух знаков, запятая допустима", () => {
    expect(money().safeParse("60000,50").success).toBe(true);
    expect(money().safeParse("1,005").success).toBe(false);
    expect(money().safeParse("0").success).toBe(false);
  });
});

describe("счёт на оплату", () => {
  it("основание и получатель обязательны", () => {
    const r = paymentRequestSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      projectId: "",
      purpose: "SALARY",
      payeeCrewId: "",
      payeeName: "",
      amount: "100",
      currency: "TJS",
      basis: "",
      note: "",
    });
    expect(r.success).toBe(false);
  });
});

describe("оплата долга", () => {
  const base = {
    id: "00000000-0000-4000-8000-000000000001",
    key: "00000000-0000-4000-8000-000000000002",
    accountId: "00000000-0000-4000-8000-000000000003",
    direction: "OUT",
    category: "SUPPLIER",
    amount: "10000",
    projectId: "",
    supplierId: "00000000-0000-4000-8000-000000000004",
    counterpartyName: "",
    basis: "Оплата поставщику",
  };
  const line = (amount: string) => ({
    payableId: "00000000-0000-4000-8000-000000000005",
    paymentRequestId: "",
    amount,
  });

  it("платим по одному обязательству из нескольких — пустые поля не мешают", () => {
    const r = quickCashSchema.safeParse({ ...base, allocations: [line("10000"), line("")] });
    expect(r.success).toBe(true);
  });

  it("ошибочная сумма в строке — ошибка", () => {
    const r = quickCashSchema.safeParse({ ...base, allocations: [line("10 000,005")] });
    expect(r.success).toBe(false);
  });
});
