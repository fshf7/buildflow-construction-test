import { describe, expect, it } from "vitest";

import { pageCount, pageWindow, resolvePage } from "./pagination";

describe("пагинация (Д-108)", () => {
  it("число страниц: по 30, пустой список — одна страница", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(30)).toBe(1);
    expect(pageCount(31)).toBe(2);
    expect(pageCount(125)).toBe(5);
  });

  it("страница из адреса: нет/мусор — первая (или последняя), больше числа страниц — последняя", () => {
    expect(resolvePage(null, 5)).toBe(1);
    expect(resolvePage(null, 5, true)).toBe(5);
    expect(resolvePage("3", 5)).toBe(3);
    expect(resolvePage("9", 5)).toBe(5);
    expect(resolvePage("0", 5)).toBe(1);
    expect(resolvePage("2.5", 5)).toBe(1);
    expect(resolvePage("abc", 5, true)).toBe(5);
  });

  it("кнопки страниц: первая, последняя, соседи; «…» только вместо двух и больше", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(1, 10)).toEqual([1, 2, null, 10]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10]);
  });
});
