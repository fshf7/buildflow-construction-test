import { describe, expect, it } from "vitest";

import {
  formatLogin,
  generateTemporaryPassword,
  isValidLogin,
  loginToAuthEmail,
  normalizeLogin,
  TEMP_PASSWORD_ALPHABET,
} from "./login";

describe("логин (Д-87)", () => {
  it("телефон в любом написании → 992XXXXXXXXX", () => {
    expect(normalizeLogin("+992 90 123-45-67")).toBe("992901234567");
    expect(normalizeLogin("992901234567")).toBe("992901234567");
    expect(normalizeLogin("+992 (90) 123 45 67")).toBe("992901234567");
  });
  it("имя — нижний регистр", () => expect(normalizeLogin(" Ivanov.A ")).toBe("ivanov.a"));
  it("формат", () => {
    expect(isValidLogin("+992901234567")).toBe(true);
    expect(isValidLogin("karimov")).toBe(true);
    expect(isValidLogin("ab")).toBe(false);
    expect(isValidLogin("1abc")).toBe(false);
    expect(isValidLogin("иванов")).toBe(false);
    expect(isValidLogin("+99290123")).toBe(false);
  });
  it("email учётной записи: техническая почта или введённый email", () => {
    expect(loginToAuthEmail("+992 90 123 45 67")).toBe("992901234567@login.buildflow.internal");
    expect(loginToAuthEmail("Karimov")).toBe("karimov@login.buildflow.internal");
    expect(loginToAuthEmail(" Admin@Example.TJ ")).toBe("admin@example.tj");
  });
  it("показ телефона", () => {
    expect(formatLogin("992901234567")).toBe("+992 90 123 45 67");
    expect(formatLogin("karimov")).toBe("karimov");
  });
});

describe("временный пароль (Д-88)", () => {
  it("14 символов, только из алфавита без похожих символов", () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(14);
      expect([...p].every((c) => TEMP_PASSWORD_ALPHABET.includes(c))).toBe(true);
      expect(p).not.toMatch(/[0Oo1lIi]/);
    }
  });
  it("каждый раз разный", () => {
    const set = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
    expect(set.size).toBe(100);
  });
});
