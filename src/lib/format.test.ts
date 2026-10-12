import { describe, expect, it } from "vitest";

import { emptyToNull, formatDate, formatDateTime } from "./format";

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
