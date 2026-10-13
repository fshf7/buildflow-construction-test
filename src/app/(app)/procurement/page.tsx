import { redirect } from "next/navigation";

import { requireOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";

export default async function ProcurementPage() {
  const org = await requireOrg();
  redirect(
    hasPermission(org, "purchase_requests.view")
      ? "/procurement/requests"
      : "/procurement/invoices",
  );
}
