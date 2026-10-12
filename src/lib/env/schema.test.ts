import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "./schema";

const valid = {
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54421",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("parsePublicEnv", () => {
  it("принимает корректный набор", () => {
    expect(parsePublicEnv(valid).NEXT_PUBLIC_APP_ENV).toBe("local");
  });

  it("падает с понятным сообщением, если ключа нет", () => {
    expect(() =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("отклоняет неизвестное окружение и не-URL", () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_APP_ENV: "prod" })).toThrow();
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "localhost" })).toThrow();
  });
});

describe("parseServerEnv", () => {
  it("секретный ключ необязателен на этом этапе", () => {
    expect(parseServerEnv({})).toEqual({});
  });
});
