import { redirect } from "next/navigation";

import { requireOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";

// «Общее по организации» (Д-94): бригады, состав и тарифы. Акты работ — внутри объекта.
export default async function CrewsLayout({ children }: LayoutProps<"/crews">) {
  const org = await requireOrg();
  if (!hasPermission(org, "crews.view")) redirect("/no-access?reason=forbidden");
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">{children}</div>;
}
