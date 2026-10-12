import { describe, expect, it } from "vitest";

import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["/warehouse", "/warehouse"],
    ["/tasks?id=1", "/tasks?id=1"],
  ])("пропускает внутренний путь %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/login",
    undefined,
    42,
  ])("заменяет небезопасное %s на /", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});
