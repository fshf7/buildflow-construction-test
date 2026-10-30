import type { Metadata } from "next";
import Link from "next/link";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PagedPager, PageSlice } from "@/components/pagination";
import { requireObject } from "@/features/projects/object";
import { listCrewOptions } from "@/features/shared/lookups";
import {
  WORK_ACT_STATUS_LABELS,
  WORK_ACT_STATUS_VARIANT,
  type WorkActStatus,
} from "@/features/work-acts/labels";
import { listWorkActs } from "@/features/work-acts/queries";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/format";
import { objectHref } from "@/lib/routes";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Акты работ" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function WorkActsPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/acts">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  if (!hasAnyPermission(org, ["work_acts.view", "work_acts.view_approved"]))
    redirect("/no-access?reason=forbidden");
  const user = await requireUser();
  const sp = await searchParams;
  const status = one(sp.status) as WorkActStatus | undefined;
  const filter = {
    status: status && status in WORK_ACT_STATUS_LABELS ? status : undefined,
    project: project.id, // Д-94: только акты этого объекта
    crew: one(sp.crew),
  };
  const [rows, crews] = await Promise.all([
    listWorkActs(org.id, filter, user.id),
    listCrewOptions(org.id),
  ]);
  const canApprove = hasPermission(org, "work_acts.approve");
  const onlyApproved = !hasPermission(org, "work_acts.view");

  return (
    <>
      <PageHeader
        title="Акты работ"
        description={
          onlyApproved
            ? "Утверждённые акты — к оплате бригадам."
            : canApprove
              ? "Акты прорабов по вашим объектам: утвердите или отклоните акты на проверке."
              : "Объёмы работ бригад по тарифам. Утверждает управляющий объекта."
        }
        actions={
          hasPermission(org, "work_acts.create") ? (
            <Link href={objectHref(project.id, "/acts/new")} className={buttonVariants()}>
              Новый акт
            </Link>
          ) : null
        }
      />
      <FiltersBar
        fields={[
          ...(onlyApproved
            ? []
            : [
                {
                  name: "status",
                  label: "Статус",
                  type: "select" as const,
                  options: Object.entries(WORK_ACT_STATUS_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  })),
                },
              ]),
          {
            name: "crew",
            label: "Бригада",
            type: "select",
            options: crews.map((c) => ({ value: c.id, label: c.label })),
          },
        ]}
      />
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Актов нет.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-lg border">
            <PageSlice>
              {rows.map((a) => (
                <li key={a.id}>
                  <Link
                    href={objectHref(project.id, `/acts/${a.id}`)}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">
                        {a.number ?? "Черновик"} · {a.crewName}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(a.docDate)}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="font-medium whitespace-nowrap tabular-nums">
                        {formatMoney(a.total, a.currency)}
                      </span>
                      <Badge variant={WORK_ACT_STATUS_VARIANT[a.status]}>
                        {WORK_ACT_STATUS_LABELS[a.status]}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </PageSlice>
          </ul>
          <PagedPager total={rows.length} />
        </>
      )}
    </>
  );
}
