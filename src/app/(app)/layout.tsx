import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";

// Всё внутри (app) — только для вошедших. proxy.ts редиректит раньше, здесь — вторая проверка.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
