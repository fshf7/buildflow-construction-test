import { describe, expect, it } from "vitest";

import { reconcile } from "./service-recon";

describe("сверка услуг (Д-112)", () => {
  it("сходится, в счетах больше, выставлено не всё", () => {
    expect(reconcile(12, 12)).toEqual({ diff: 0, status: "ok" });
    expect(reconcile(40, 48)).toEqual({ diff: 8, status: "over" });
    expect(reconcile(12, 10)).toEqual({ diff: -2, status: "under" });
  });

  it("дробные количества без ошибок округления", () => {
    expect(reconcile(0.1 + 0.2, 0.3)).toEqual({ diff: 0, status: "ok" });
  });
});
