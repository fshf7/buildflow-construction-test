import { describe, expect, it } from "vitest";

import { parsePasswordResetArgs } from "./password-reset-args.mts";

describe("password:reset — аргументы", () => {
  it("логин, причина, подтверждение", () => {
    expect(
      parsePasswordResetArgs(["--login", "+992901234567", "--reason", "Забыл пароль", "--yes"]),
    ).toEqual({
      login: "+992901234567",
      reason: "Забыл пароль",
      yes: true,
    });
  });
  it("без --yes и причины — отказ", () => {
    expect(() => parsePasswordResetArgs(["--login", "karimov"])).toThrow(/--reason[\s\S]*--yes/);
  });
});
