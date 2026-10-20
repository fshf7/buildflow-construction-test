import { redirect } from "next/navigation";

import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";

import { financeScope, type ScopedParams } from "../scope";

export default async function FinancePage({ params }: { params: ScopedParams }) {
  const { org, scope } = await financeScope(params);
  const to = (path: string) => redirect(`${scope.base}${path}`);
  if (hasAnyPermission(org, ["cash.view", "cash_accounts.manage"])) to("/cash");
  if (hasPermission(org, "payables.view")) to("/payables");
  if (hasPermission(org, "payment_requests.view")) to("/requests");
  to(scope.projectId === null ? "/reversals" : "/cash");
}
