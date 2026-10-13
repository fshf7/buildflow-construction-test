import { redirect } from "next/navigation";

import { requireOrg } from "@/lib/auth/access";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";

export default async function FinancePage() {
  const org = await requireOrg();
  if (hasAnyPermission(org, ["cash.view", "cash_accounts.manage"])) redirect("/finance/cash");
  if (hasPermission(org, "payables.view")) redirect("/finance/payables");
  redirect(
    hasPermission(org, "payment_requests.view") ? "/finance/requests" : "/finance/reversals",
  );
}
