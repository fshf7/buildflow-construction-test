import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { listServices, listWorkStages } from "@/features/catalog/queries";
import { requireObject } from "@/features/projects/object";
import {
  listBlockOptions,
  listOwnCrewIds,
  listResponsibleOptions,
  listUnitOptions,
} from "@/features/shared/lookups";
import {
  SERVICE_REQUEST_STATUS,
  ServiceRequests,
} from "@/features/warehouse/components/service-requests";
import { ServicesSheet } from "@/features/warehouse/components/services-sheet";
import { listServiceRequests, listServiceRows } from "@/features/warehouse/sheets";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { getCurrentUser } from "@/lib/auth/session";
import { businessToday } from "@/lib/format";
import { objectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Услуги" };

/**
 * «Услуги» склада (Д-100): «Журнал» — факт (кран, экскаватор, питание — по блокам, этапам и
 * бригадам) таблицей; «Заявки» (Д-111) — необязательные заявки на дорогие услуги, согласует
 * управляющий.
 */
export default async function ServicesPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/warehouse/services">) {
  const { projectId } = await params;
  const { view: rawView, status } = await searchParams;
  const view = rawView === "requests" ? "requests" : "journal";
  const { org, project } = await requireObject(projectId);
  if (!hasAnyPermission(org, ["stock.view", "stock.view_own_crews"]))
    redirect("/no-access?reason=forbidden");
  const [rows, requests, services, units, blocks, stages, crews, user] = await Promise.all([
    view === "journal" ? listServiceRows(project.id) : [],
    listServiceRequests(org.id, project.id),
    listServices(org.id, true),
    listUnitOptions(org.id),
    listBlockOptions(project.id),
    listWorkStages(org.id),
    listResponsibleOptions(org.id),
    getCurrentUser(),
  ]);
  const canManage = hasPermission(org, "material_issues.post");
  const ownIds = canManage ? null : await listOwnCrewIds(org.id, org.member_id);
  const waiting = requests.filter((r) => r.status === "SUBMITTED").length;
  const shown =
    typeof status === "string" && status ? requests.filter((r) => r.status === status) : requests;
  const tab = (v: "journal" | "requests", label: React.ReactNode) => (
    <Link
      href={objectHref(
        project.id,
        `/warehouse/services${v === "requests" ? "?view=requests" : ""}`,
      )}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
        view === v
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader
        title="Услуги"
        description="Кран, экскаватор, геодезист, питание — сколько, где и для какой бригады."
      />
      <nav aria-label="Услуги" className="flex flex-wrap gap-1">
        {tab("journal", "Журнал")}
        {tab(
          "requests",
          <>
            Заявки
            {waiting > 0 ? (
              <span
                className="rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white"
                title="На согласовании"
              >
                {waiting}
              </span>
            ) : null}
          </>,
        )}
      </nav>
      {view === "requests" ? (
        <>
          <FiltersBar
            inline
            fields={[
              {
                name: "status",
                label: "Статус",
                type: "select",
                options: Object.entries(SERVICE_REQUEST_STATUS).map(([value, label]) => ({
                  value,
                  label,
                })),
              },
            ]}
          />
          <ServiceRequests
            rows={shown}
            services={services}
            blocks={blocks}
            stages={stages.map((s) => ({ id: s.id, label: s.name }))}
            crews={crews}
            ownCrews={ownIds ? crews.filter((c) => ownIds.has(c.id)) : crews}
            canCreate={hasPermission(org, "service_requests.create")}
            canApprove={hasPermission(org, "service_requests.approve")}
            canManage={canManage}
            userId={user?.id ?? ""}
          />
        </>
      ) : (
        <ServicesSheet
          rows={rows}
          services={services}
          units={units}
          blocks={blocks}
          stages={stages.map((s) => ({ id: s.id, label: s.name }))}
          crews={crews}
          requests={requests.filter((r) => r.status === "APPROVED")}
          canEdit={canManage}
          canFixOld={hasPermission(org, "goods_receipts.approve_correction")}
          today={businessToday()}
        />
      )}
    </>
  );
}
