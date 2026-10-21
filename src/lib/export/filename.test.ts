import { describe, expect, it } from "vitest";

import { attachment } from "./filename";

describe("имя файла выгрузки", () => {
  it("кириллица — в filename*, ASCII-запасное без неё", () => {
    const h = attachment("sklad-prihod-Т1-2026-10-21.xlsx");
    expect(h).toContain('filename="sklad-prihod-_1-2026-10-21.xlsx"');
    expect(h).toContain("filename*=UTF-8''sklad-prihod-%D0%A21-2026-10-21.xlsx");
    expect(/^[\x20-\x7e]*$/.test(h)).toBe(true);
  });
});
