import { describe, expect, it } from "vitest";

import { objectHref, objectIdFromPath } from "@/lib/routes";

import { allowedItems, COMMON_NAV, isActive, itemHref, OBJECT_NAV } from "./nav-items";

const paths = (items: { path: string }[]) => items.map((i) => i.path);

describe("навигация (Д-94)", () => {
  it("пути пунктов уникальны в каждом меню", () => {
    for (const items of [OBJECT_NAV, COMMON_NAV]) {
      const p = paths([...items]);
      expect(new Set(p).size).toBe(p.length);
    }
  });

  it("без прав в объекте видна только его главная, «Общего» нет", () => {
    expect(paths(allowedItems(OBJECT_NAV, []))).toEqual([""]);
    expect(allowedItems(COMMON_NAV, [])).toEqual([]);
  });

  it("склад: закупки, склад, задачи, отчёты объекта; без кассы и актов; «Общего» нет", () => {
    const perms = [
      "projects.view",
      "purchase_requests.view",
      "purchase_requests.manage",
      "supplier_invoices.view",
      "stock.view",
      "goods_receipts.post",
      "material_issues.post",
      "tasks.execute",
    ];
    expect(paths(allowedItems(OBJECT_NAV, perms))).toEqual([
      "",
      "/procurement",
      "/warehouse",
      "/tasks",
      "/reports",
    ]);
    expect(allowedItems(COMMON_NAV, perms)).toEqual([]);
  });

  it("прораб не видит участников, аудит и справочники", () => {
    const common = paths(
      allowedItems(COMMON_NAV, ["crews.view", "work_acts.create", "tasks.execute"]),
    );
    expect(common).toContain("/crews");
    expect(common).not.toContain("/admin/members");
    expect(common).not.toContain("/admin/audit");
    expect(common).not.toContain("/catalog");
  });

  it("администратор видит участников в «Общем»", () => {
    expect(paths(allowedItems(COMMON_NAV, ["members.manage"]))).toContain("/admin/members");
  });

  it("адреса: объектный пункт — внутри объекта, общий — как есть", () => {
    const warehouse = OBJECT_NAV.find((i) => i.path === "/warehouse")!;
    expect(itemHref(warehouse, "p1")).toBe("/objects/p1/warehouse");
    expect(itemHref(OBJECT_NAV[0]!, "p1")).toBe("/objects/p1");
    expect(objectHref("p1", "/tasks")).toBe("/objects/p1/tasks");
    expect(objectIdFromPath("/objects/p1/warehouse/issue")).toBe("p1");
    expect(objectIdFromPath("/objects/p1")).toBe("p1");
    expect(objectIdFromPath("/finance")).toBeNull();
  });

  it("главная объекта активна только на ней самой; раздел — и на вложенных страницах", () => {
    expect(isActive("/objects/p1", "/objects/p1", true)).toBe(true);
    expect(isActive("/objects/p1/warehouse", "/objects/p1", true)).toBe(false);
    expect(isActive("/objects/p1/warehouse/receipts", "/objects/p1/warehouse")).toBe(true);
    expect(isActive("/warehouses", "/warehouse")).toBe(false);
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/catalog", "/")).toBe(false);
  });
});
