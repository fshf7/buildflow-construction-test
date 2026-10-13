import { redirect } from "next/navigation";

import { requireOrg } from "@/lib/auth/access";
import { hasAnyPermission } from "@/lib/auth/access-model";

export default async function CrewsIndex() {
  const org = await requireOrg();
  redirect(
    hasAnyPermission(org, ["work_acts.view", "work_acts.view_approved"])
      ? "/crews/acts"
      : "/crews/teams",
  );
}
