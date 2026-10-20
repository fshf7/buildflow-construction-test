import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { listProjectOptions } from "@/features/shared/lookups";
import { getAccess, requireOrg } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";

// Всё внутри (app) — только для вошедших участников организации. proxy.ts редиректит на вход,
// здесь — экран MFA (Д-29, Д-96) и данные для меню.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const org = await requireOrg();
  const [access, projects] = await Promise.all([getAccess(), listProjectOptions(org.id)]);
  // Д-29: без aal2 привилегированная роль в приложение не попадает (данные закрыты и в БД).
  if (access.organizations.some((o) => o.requires_mfa) && access.aal !== "aal2") {
    const next = (await headers()).get("x-pathname");
    redirect(next && next !== "/" ? `/mfa?next=${encodeURIComponent(next)}` : "/mfa");
  }

  return (
    <AppShell
      displayName={org.full_name || user.email || "Пользователь"}
      currentOrg={{ id: org.id, name: org.name }}
      organizations={access.organizations.map((o) => ({ id: o.id, name: o.name }))}
      permissions={org.permissions}
      projects={projects}
    >
      {children}
    </AppShell>
  );
}
