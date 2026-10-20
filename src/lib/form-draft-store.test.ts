import { describe, expect, it } from "vitest";

import {
  clearAllDrafts,
  DRAFT_TTL_MS,
  draftStorageKey,
  parseStoredDraft,
  purgeExpiredDrafts,
} from "./form-draft-store";

function memoryStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

const NOW = Date.UTC(2026, 9, 20, 9, 0);
const draft = (savedAt: number, values: unknown = { id: "x", lines: [{ quantity: "" }] }) =>
  JSON.stringify({ savedAt, values });

describe("несохранённый ввод формы на устройстве", () => {
  it("ключ — по участнику организации и форме", () => {
    expect(draftStorageKey("m1", "request.new")).toBe("bf.draft.v1.m1.request.new");
    expect(draftStorageKey("m1", "request.new")).not.toBe(draftStorageKey("m2", "request.new"));
  });

  it("незаконченный ввод (пустое количество) восстанавливается как есть", () => {
    expect(parseStoredDraft(draft(NOW - 60_000), NOW)).toEqual({
      savedAt: NOW - 60_000,
      values: { id: "x", lines: [{ quantity: "" }] },
    });
  });

  it("битое, чужого формата или старше 7 дней — не восстанавливается", () => {
    expect(parseStoredDraft(null, NOW)).toBeNull();
    expect(parseStoredDraft("{не json", NOW)).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ savedAt: NOW, values: { id: "x" } }), NOW)).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ values: { lines: [] } }), NOW)).toBeNull();
    expect(parseStoredDraft(draft(NOW - DRAFT_TTL_MS - 1), NOW)).toBeNull();
  });

  it("чистка: просроченное и битое удаляется, свежее и чужие ключи остаются", () => {
    const storage = memoryStorage({
      "bf.draft.v1.m1.request.new": draft(NOW - 1000),
      "bf.draft.v1.m2.invoice.new": draft(NOW - DRAFT_TTL_MS - 1),
      "bf.draft.v1.m3.request.x": "мусор",
      "bf.issue.p1": "{}",
    });
    purgeExpiredDrafts(storage, NOW);
    expect(storage.keys()).toEqual(["bf.draft.v1.m1.request.new", "bf.issue.p1"]);
  });

  it("выход: удаляется весь ввод форм, прочие настройки устройства остаются", () => {
    const storage = memoryStorage({
      "bf.draft.v1.m1.request.new": draft(NOW),
      "bf.draft.v1.m1.invoice.abc": draft(NOW),
      "bf.issue.p1": "{}",
    });
    clearAllDrafts(storage);
    expect(storage.keys()).toEqual(["bf.issue.p1"]);
  });
});
