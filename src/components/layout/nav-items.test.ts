import { describe, expect, it } from "vitest";

import { isActive, NAV_ITEMS } from "./nav-items";

describe("навигация", () => {
  it("адреса пунктов уникальны", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("«Главная» активна только на /", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/warehouse", "/")).toBe(false);
  });

  it("раздел активен на вложенных страницах, но не на похожих префиксах", () => {
    expect(isActive("/warehouse/receipts", "/warehouse")).toBe(true);
    expect(isActive("/warehouses", "/warehouse")).toBe(false);
  });
});
