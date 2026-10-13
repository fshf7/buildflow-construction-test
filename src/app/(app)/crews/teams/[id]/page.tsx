import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { CrewMembers } from "@/features/crews/components/crew-members";
import { RatesSection } from "@/features/crews/components/rates-section";
import { getCrew, listRates } from "@/features/crews/queries";
import { listProjectOptions, listUnitOptions } from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { businessToday } from "@/lib/format";

export const metadata: Metadata = { title: "Бригада" };

export default async function CrewPage({ params }: PageProps<"/crews/teams/[id]">) {
  const org = await requirePermission("crews.view");
  const { id } = await params;
  const [crew, rates, projects, units] = await Promise.all([
    getCrew(id),
    listRates(org.id, id),
    listProjectOptions(org.id),
    listUnitOptions(org.id),
  ]);
  if (!crew) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={crew.name}
        description={
          [
            crew.leaderName && `бригадир ${crew.leaderName}`,
            crew.phone,
            crew.foremanName && `прораб: ${crew.foremanName}`,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
      />
      {crew.isActive ? null : <Badge variant="secondary">Архив</Badge>}
      <RatesSection
        crewId={crew.id}
        rates={rates}
        projects={projects}
        units={units}
        canManage={hasPermission(org, "work_rates.manage")}
        today={businessToday()}
      />
      <CrewMembers
        crewId={crew.id}
        members={crew.members}
        canManage={hasPermission(org, "crews.manage")}
      />
    </div>
  );
}
