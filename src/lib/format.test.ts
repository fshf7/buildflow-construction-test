import { describe, expect, it } from "vitest";

import {
  emptyToNull,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  initials,
} from "./format";

describe("format", () => {
  it("дата из Postgres без сдвига пояса", () => {
    expect(formatDate("2026-01-01")).toBe("01.01.2026");
    expect(formatDate(null)).toBe("—");
  });
  it("дата и время — по Душанбе (UTC+5)", () => {
    expect(formatDateTime("2026-10-12T19:30:00Z")).toBe("13.10.2026, 00:30");
  });
  it("пустые строки → null", () => {
    expect(emptyToNull("  ")).toBeNull();
    expect(emptyToNull(" a ")).toBe("a");
  });
});

describe("количества и деньги", () => {
  it("количество с единицей, без лишних нулей", () => {
    expect(formatQuantity("12.5000", "кг")).toBe("12,5 кг");
    expect(formatQuantity(null)).toBe("—");
  });
  it("деньги — два знака и валюта", () => {
    expect(formatMoney("1234.5")).toBe("1\u00a0234,50 TJS");
  });
  it("инициалы для аватара", () => {
    expect(initials("Иван Петров")).toBe("ИП");
    expect(initials("  иван   петров сидорович ")).toBe("ИП");
    expect(initials("Бухгалтер")).toBe("Б");
    expect(initials("ivan.petrov@site.tj")).toBe("IP");
    expect(initials("")).toBe("?");
    expect(initials("@site.tj")).toBe("?");
  });
});
