import { describe, expect, it } from "vitest";

import { isOverdue, taskMoves } from "./labels";

describe("isOverdue", () => {
  it("срок прошёл и задача открыта", () =>
    expect(isOverdue("2026-10-01", "IN_PROGRESS", "2026-10-02")).toBe(true));
  it("срок сегодня — ещё не просрочена", () =>
    expect(isOverdue("2026-10-02", "NEW", "2026-10-02")).toBe(false));
  it("закрытая не просрочена", () =>
    expect(isOverdue("2026-10-01", "DONE", "2026-10-05")).toBe(false));
  it("без срока не просрочена", () => expect(isOverdue(null, "NEW", "2026-10-05")).toBe(false));
});

describe("taskMoves", () => {
  const to = (s: Parameters<typeof taskMoves>[0], r: Parameters<typeof taskMoves>[1]) =>
    taskMoves(s, r).map((m) => m.to);
  it("исполнитель: в работу, на проверку, блокировка — но не закрытие", () => {
    expect(to("NEW", { executor: true, manager: false })).toEqual(["IN_PROGRESS", "BLOCKED"]);
    expect(to("IN_PROGRESS", { executor: true, manager: false })).toEqual(["ON_REVIEW", "BLOCKED"]);
    expect(to("ON_REVIEW", { executor: true, manager: false })).toEqual([]);
  });
  it("управляющий: принять, вернуть с комментарием, отменить", () => {
    const moves = taskMoves("ON_REVIEW", { executor: false, manager: true });
    expect(moves.map((m) => m.to)).toEqual(["DONE", "IN_PROGRESS", "CANCELLED"]);
    expect(moves[1]?.comment).toBeDefined();
  });
  it("закрытая задача — без действий", () => {
    expect(to("DONE", { executor: true, manager: true })).toEqual([]);
  });
});
