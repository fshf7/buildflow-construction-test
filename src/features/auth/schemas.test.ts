import { describe, expect, it } from "vitest";

import { loginSchema } from "./schemas";

describe("loginSchema (Д-87)", () => {
  it("принимает телефон, имя латиницей и email", () => {
    for (const login of ["+992 90 123 45 67", "Karimov", "admin@buildflow.local"]) {
      expect(loginSchema.safeParse({ login, password: "x" }).success).toBe(true);
    }
  });

  it("сообщения об ошибках — на русском", () => {
    const r = loginSchema.safeParse({ login: "иванов", password: "" });
    expect(r.success).toBe(false);
    const messages = r.error?.issues.map((i) => i.message);
    expect(messages).toContain("Телефон +992XXXXXXXXX, имя латиницей или email");
    expect(messages).toContain("Введите пароль");
  });
});
