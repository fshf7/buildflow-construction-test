import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { generateTemporaryPassword, loginToAuthEmail, normalizeLogin } from "@/lib/auth/login";
import type { Database } from "@/lib/supabase/database.types";

import { createFixture, createMemberWithMfa, local, must, service, type Fixture } from "./setup";

// Д-87…Д-89 через API — тем же путём, что приложение: проверка логина (администратор aal2) →
// учётная запись admin API с временным паролем и признаком смены → логин → членство.
let fx: Fixture;
let admin: SupabaseClient<Database>;

beforeAll(async () => {
  fx = await createFixture("login");
  admin = await createMemberWithMfa(fx.orgId, "org_admin");
});

const orgs = (access: unknown) => (access as { organizations: unknown[] }).organizations;
function okAuth<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

const anon = () =>
  createClient<Database>(local.apiUrl, local.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

async function createEmployee(rawLogin: string) {
  const login = must(
    await admin.rpc("prepare_member_account", { p_org: fx.orgId, p_login: rawLogin }),
  );
  const temp = generateTemporaryPassword();
  const created = await service.auth.admin.createUser({
    email: loginToAuthEmail(login),
    password: temp,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  must(await service.rpc("register_login", { p_user_id: userId, p_login: login }));
  const memberId = must(
    await admin.rpc("add_member", {
      p_org: fx.orgId,
      p_user_id: userId,
      p_email: null as unknown as string,
      p_full_name: `Сотрудник ${login}`,
      p_role_codes: ["warehouse"],
      p_all_projects: false,
      p_project_ids: [fx.projectId],
    }),
  );
  return { login, temp, userId, memberId: memberId as string };
}

async function signIn(rawLogin: string, password: string) {
  const c = anon();
  const r = await c.auth.signInWithPassword({ email: loginToAuthEmail(rawLogin), password });
  return { client: c, error: r.error };
}

describe("вход по логину", () => {
  it("по телефону и по имени; до смены пароля данных нет, после — есть; временный пароль больше не работает", async () => {
    const digits = String(100_000_000 + Math.floor(Math.random() * 899_999_999));
    for (const raw of [`+992 ${digits}`, `Sklad.${randomUUID().slice(0, 6)}`]) {
      const e = await createEmployee(raw);
      expect(e.login).toBe(normalizeLogin(raw));

      const first = await signIn(raw, e.temp);
      expect(first.error).toBeNull();
      expect(orgs(must(await first.client.rpc("my_access")))).toEqual([]);
      expect(must(await first.client.from("projects").select("id"))).toEqual([]);

      const own = `Own-${randomUUID().slice(0, 8)}`;
      expect((await first.client.auth.updateUser({ password: own })).error).toBeNull();
      // Признак снимает сервер (как setPassword в приложении), затем новый токен — без признака.
      okAuth(
        await service.auth.admin.updateUserById(e.userId, {
          app_metadata: { must_change_password: false },
        }),
      );
      expect((await first.client.auth.refreshSession()).error).toBeNull();
      expect(orgs(must(await first.client.rpc("my_access")))).toHaveLength(1);
      expect(
        must(await first.client.from("projects").select("id").eq("id", fx.projectId)),
      ).toHaveLength(1);

      expect((await signIn(raw, e.temp)).error).not.toBeNull();
      expect((await signIn(raw, own)).error).toBeNull();
    }
  });

  it("сброс администратором: старая сессия не даёт данных, refresh не работает", async () => {
    const e = await createEmployee(`reset.${randomUUID().slice(0, 6)}`);
    const s = await signIn(e.login, e.temp);
    const own = `Own-${randomUUID().slice(0, 8)}`;
    await s.client.auth.updateUser({ password: own });
    okAuth(
      await service.auth.admin.updateUserById(e.userId, {
        app_metadata: { must_change_password: false },
      }),
    );
    await s.client.auth.refreshSession();
    expect(must(await s.client.from("projects").select("id"))).not.toEqual([]);

    expect(must(await admin.rpc("prepare_password_reset", { p_member_id: e.memberId }))).toBe(
      e.userId,
    );
    const temp2 = generateTemporaryPassword();
    okAuth(
      await service.auth.admin.updateUserById(e.userId, {
        password: temp2,
        app_metadata: { must_change_password: true },
      }),
    );
    // Число завершённых сессий не проверяем: Supabase Auth закрывает их уже при смене пароля admin API.
    const done = await admin.rpc("complete_password_reset", {
      p_member_id: e.memberId,
      p_reason: "Забыл пароль",
    });
    expect(done.error).toBeNull();

    // Access-токен ещё не истёк, но сессии нет — данных нет (Д-47); обновить сессию нельзя.
    expect(must(await s.client.from("projects").select("id"))).toEqual([]);
    expect((await s.client.auth.refreshSession()).error).not.toBeNull();
    expect((await signIn(e.login, own)).error).not.toBeNull();
    const again = await signIn(e.login, temp2);
    expect(again.error).toBeNull();
    expect(orgs(must(await again.client.rpc("my_access")))).toEqual([]); // снова обязательная смена
  });

  it("дубль логина — отказ, лишней учётной записи не остаётся", async () => {
    const e = await createEmployee(`dup.${randomUUID().slice(0, 6)}`);
    const r = await admin.rpc("prepare_member_account", {
      p_org: fx.orgId,
      p_login: e.login.toUpperCase(),
    });
    expect(r.error?.message).toBe("BF_LOGIN_TAKEN");
    const created = await service.auth.admin.createUser({
      email: loginToAuthEmail(e.login),
      password: generateTemporaryPassword(),
      email_confirm: true,
    });
    expect(created.error?.code).toBe("email_exists");
  });
});
