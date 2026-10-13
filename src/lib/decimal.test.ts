import { describe, expect, it } from "vitest";

import { decimalString, toNumber } from "./decimal";

describe("decimalString", () => {
  it("принимает запятую и точку", () => {
    expect(decimalString().safeParse("12,5").success).toBe(true);
    expect(toNumber("12,5")).toBe(12.5);
  });
  it("ноль — только если разрешён", () => {
    expect(decimalString().safeParse("0").success).toBe(false);
    expect(decimalString({ allowZero: true }).safeParse("0").success).toBe(true);
  });
  it("не больше 4 знаков после запятой и не текст", () => {
    expect(decimalString().safeParse("1,23456").success).toBe(false);
    expect(decimalString().safeParse("abc").success).toBe(false);
    expect(decimalString().safeParse("-5").success).toBe(false);
  });
});
