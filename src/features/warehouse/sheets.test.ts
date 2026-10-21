import { describe, expect, it } from "vitest";

import { normStatus } from "./sheets";

describe("норматив (Д-100)", () => {
  it("статус: в норме, перерасход, не задан", () => {
    expect(normStatus(60, 20)).toBe("В норме");
    expect(normStatus(60, 60)).toBe("В норме");
    expect(normStatus(60, 60.5)).toBe("Перерасход");
    expect(normStatus(null, 20)).toBe("");
  });
});
