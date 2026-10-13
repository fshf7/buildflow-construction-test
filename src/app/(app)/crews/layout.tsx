import { redirect } from "next/navigation";

import { SectionTabs } from "@/components/section-tabs";
import { requireOrg } from "@/lib/auth/access";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";

export default async function CrewsLayout({ children }: LayoutProps<"/crews">) {
  const org = await requireOrg();
  if (!hasAnyPermission(org, ["crews.view", "work_acts.view", "work_acts.view_approved"])) {
    redirect("/no-access?reason=forbidden");
  }
  const tabs = [
    ...(hasAnyPermission(org, ["work_acts.view", "work_acts.view_approved"])
      ? [{ href: "/crews/acts", label: "Акты работ" }]
      : []),
    ...(hasPermission(org, "crews.view") ? [{ href: "/crews/teams", label: "Бригады" }] : []),
  ];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <SectionTabs tabs={tabs} label="Бригады и акты" />
      {children}
    </div>
  );
}
