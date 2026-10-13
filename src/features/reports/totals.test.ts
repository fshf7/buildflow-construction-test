import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { withTotals, type Column } from "./definitions";

const columns: Column[] = [
  { key: "amount", label: "Сумма", kind: "money", total: true },
  { key: "currency", label: "Валюта", kind: "text" },
];

describe("withTotals", () => {
  it("итог без ошибки двоичной арифметики: 0,1 + 0,2 = 0,3", () => {
    const r = withTotals({
      columns,
      rows: [
        { amount: 0.1, currency: "TJS" },
        { amount: 0.2, currency: "TJS" },
      ],
    });
    expect(r.totals).toEqual({ amount: 0.3 });
    expect(r.currency).toBe("TJS");
  });
  it("разные валюты — итог не считается", () => {
    const r = withTotals({
      columns,
      rows: [
        { amount: 1, currency: "TJS" },
        { amount: 1, currency: "USD" },
      ],
    });
    expect(r.totals).toBeNull();
  });
});
