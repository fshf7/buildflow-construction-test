import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { allowedNavHrefs } from "@/components/layout/nav-items";
import { getAccess, requireOrg } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";

// Всё внутри (app) — только для вошедших участников организации. proxy.ts редиректит раньше
// (вход, MFA), здесь — вторая проверка и данные для меню.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const org = await requireOrg();
  const access = await getAccess();
  // Д-29, второй рубеж после proxy.ts: без aal2 привилегированная роль в приложение не попадает.
  if (access.organizations.some((o) => o.requires_mfa) && access.aal !== "aal2") redirect("/mfa");

  return (
    <AppShell
      displayName={org.full_name || user.email || "Пользователь"}
      currentOrg={{ id: org.id, name: org.name }}
      organizations={access.organizations.map((o) => ({ id: o.id, name: o.name }))}
      allowedHrefs={allowedNavHrefs(org.permissions)}
    >
      {children}
    </AppShell>
  );
}
