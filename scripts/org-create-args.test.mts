import { describe, expect, it } from "vitest";

import { isLocalUrl, parseOrgCreateArgs } from "./org-create-args.mts";

describe("org:create — аргументы", () => {
  it("разбирает и нормализует", () => {
    const a = parseOrgCreateArgs([
      "--name",
      "СК Восток",
      "--admin-login",
      " +992 90 123 45 67 ",
      "--admin-name",
      "Иванов И.",
      "--yes",
    ]);
    expect(a).toEqual({
      name: "СК Восток",
      adminLogin: "+992 90 123 45 67",
      adminName: "Иванов И.",
      yes: true,
      promptPassword: false,
    });
  });

  it("--prompt-password: пароль спрашивается в терминале, не вместе с --password", () => {
    const base = ["--name", "СК", "--admin-login", "a@b.tj", "--admin-name", "Иванов"];
    expect(parseOrgCreateArgs([...base, "--prompt-password"]).promptPassword).toBe(true);
    expect(() =>
      parseOrgCreateArgs([...base, "--prompt-password", "--password", "0123456789"]),
    ).toThrow(/вместе/);
  });

  it("сообщает, чего не хватает", () => {
    expect(() => parseOrgCreateArgs(["--name", "СК"])).toThrow(/--admin-login/);
  });

  it("не принимает неизвестные флаги", () => {
    expect(() => parseOrgCreateArgs(["--force"])).toThrow();
  });

  it("распознаёт локальный адрес", () => {
    expect(isLocalUrl("http://127.0.0.1:54421")).toBe(true);
    expect(isLocalUrl("https://abc.supabase.co")).toBe(false);
  });
});
