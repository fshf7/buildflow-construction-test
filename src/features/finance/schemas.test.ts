import { describe, expect, it } from "vitest";

import { money, paymentRequestSchema } from "./schemas";

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
