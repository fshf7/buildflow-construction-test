import { describe, expect, it } from "vitest";

import { isLocalUrl, parseOrgCreateArgs } from "./org-create-args.mts";

describe("org:create — аргументы", () => {
  it("разбирает и нормализует", () => {
    const a = parseOrgCreateArgs([
      "--name",
      "СК Восток",
      "--admin-email",
      " Admin@Example.TJ ",
      "--admin-name",
      "Иванов И.",
      "--yes",
    ]);
    expect(a).toEqual({
      name: "СК Восток",
      adminEmail: "admin@example.tj",
      adminName: "Иванов И.",
      yes: true,
    });
  });

  it("сообщает, чего не хватает", () => {
    expect(() => parseOrgCreateArgs(["--name", "СК"])).toThrow(/--admin-email/);
  });

  it("не принимает неизвестные флаги", () => {
    expect(() => parseOrgCreateArgs(["--force"])).toThrow();
  });

  it("распознаёт локальный адрес", () => {
    expect(isLocalUrl("http://127.0.0.1:54421")).toBe(true);
    expect(isLocalUrl("https://abc.supabase.co")).toBe(false);
  });
});
