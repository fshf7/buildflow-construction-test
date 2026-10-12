import { describe, expect, it } from "vitest";

import { allowedNavHrefs, isActive, NAV_ITEMS } from "./nav-items";

describe("навигация", () => {
  it("адреса пунктов уникальны", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("без прав видна только «Главная»", () => {
    expect(allowedNavHrefs([])).toEqual(["/"]);
  });

  it("прораб не видит участников, аудит и справочники", () => {
    const hrefs = allowedNavHrefs([
      "projects.view",
      "crews.view",
      "work_acts.create",
      "tasks.view",
    ]);
    expect(hrefs).toContain("/projects");
    expect(hrefs).toContain("/crews");
    expect(hrefs).not.toContain("/admin/members");
    expect(hrefs).not.toContain("/admin/audit");
    expect(hrefs).not.toContain("/catalog");
  });

  it("администратор видит управление участниками", () => {
    expect(allowedNavHrefs(["members.manage"])).toContain("/admin/members");
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
