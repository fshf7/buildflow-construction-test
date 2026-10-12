import { describe, expect, it } from "vitest";

import { assertLocal } from "./local-supabase.mts";

describe("assertLocal — служебные скрипты только для локальной БД", () => {
  it.each(["http://127.0.0.1:54421", "http://localhost:54421"])("пропускает %s", (url) => {
    expect(() => assertLocal(url, "local")).not.toThrow();
    expect(() => assertLocal(url, undefined)).not.toThrow();
  });

  it("отказывает облачному Supabase", () => {
    expect(() => assertLocal("https://abcd.supabase.co", undefined)).toThrow(/не локальный/);
  });

  it.each(["staging", "production"])("отказывает при NEXT_PUBLIC_APP_ENV=%s", (appEnv) => {
    expect(() => assertLocal("http://127.0.0.1:54421", appEnv)).toThrow(/Отказ/);
  });
});
