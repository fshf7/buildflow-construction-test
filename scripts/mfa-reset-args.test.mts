import { describe, expect, it } from "vitest";

import { parseMfaResetArgs } from "./mfa-reset-args.mts";

describe("mfa:reset — аргументы", () => {
  it("требует --yes", () => {
    expect(() => parseMfaResetArgs(["--email", "a@b.tj", "--reason", "Потерян"])).toThrow(/--yes/);
  });
  it("требует причину", () => {
    expect(() => parseMfaResetArgs(["--email", "a@b.tj", "--yes"])).toThrow(/--reason/);
  });
  it("нормализует email", () => {
    expect(
      parseMfaResetArgs(["--email", " A@B.tj ", "--reason", "Потерян телефон", "--yes"]),
    ).toEqual({
      email: "a@b.tj",
      reason: "Потерян телефон",
      yes: true,
    });
  });
});
