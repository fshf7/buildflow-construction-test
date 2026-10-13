import { redirect } from "next/navigation";

import { requireOrg } from "@/lib/auth/access";
import { hasAnyPermission } from "@/lib/auth/access-model";

export default async function WarehouseLayout({ children }: LayoutProps<"/warehouse">) {
  const org = await requireOrg();
  if (!hasAnyPermission(org, ["stock.view", "stock.view_own_crews"]))
    redirect("/no-access?reason=forbidden");
  // Склад работает с телефона: узкая колонка и крупные элементы (US-10).
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">{children}</div>;
}
