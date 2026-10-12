import { describe, expect, it } from "vitest";

import { loginSchema } from "./schemas";

describe("loginSchema", () => {
  it("нормализует email", () => {
    const r = loginSchema.parse({ email: "  Admin@BuildFlow.Local ", password: "x" });
    expect(r.email).toBe("admin@buildflow.local");
  });

  it("сообщения об ошибках — на русском", () => {
    const r = loginSchema.safeParse({ email: "не email", password: "" });
    expect(r.success).toBe(false);
    const messages = r.error?.issues.map((i) => i.message);
    expect(messages).toContain("Введите корректный email");
    expect(messages).toContain("Введите пароль");
  });
});
