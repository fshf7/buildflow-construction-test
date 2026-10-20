import { redirect } from "next/navigation";

import { requireOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { objectHref } from "@/lib/routes";

export default async function ProcurementPage({
  params,
}: PageProps<"/objects/[projectId]/procurement">) {
  const { projectId } = await params;
  const org = await requireOrg();
  redirect(
    objectHref(
      projectId,
      hasPermission(org, "supplier_invoices.view")
        ? "/procurement/invoices"
        : "/procurement/approvals",
    ),
  );
}
