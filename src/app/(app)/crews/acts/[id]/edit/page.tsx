import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { listRates } from "@/features/crews/queries";
import { listBlockOptions, listCrewOptions } from "@/features/shared/lookups";
import { ActForm } from "@/features/work-acts/components/act-form";
import { getWorkAct } from "@/features/work-acts/queries";
import { requirePermission } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { businessToday } from "@/lib/format";

export const metadata: Metadata = { title: "Черновик акта" };

export default async function EditWorkActPage({ params }: PageProps<"/crews/acts/[id]/edit">) {
  const org = await requirePermission("work_acts.create");
  const user = await requireUser();
  const { id } = await params;
  const act = await getWorkAct(id);
  if (!act) notFound();
  if (act.status !== "DRAFT" || act.createdBy !== user.id) redirect(`/crews/acts/${id}`);
  const [crews, rates, blocks] = await Promise.all([
    listCrewOptions(org.id),
    listRates(org.id),
    listBlockOptions(act.projectId),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <PageHeader title="Черновик акта" description={act.projectLabel} />
      <ActForm
        projectId={act.projectId}
        crews={crews}
        rates={rates}
        blocks={blocks}
        today={businessToday()}
        initial={{
          id: act.id,
          crewId: act.crewId,
          docDate: act.docDate,
          periodFrom: act.periodFrom ?? "",
          periodTo: act.periodTo ?? "",
          note: act.note ?? "",
          lines: act.lines.map((l) => ({
            workType: l.workType,
            blockId: l.blockId ?? "",
            floorId: l.floorId ?? "",
            quantity: String(l.quantity).replace(".", ","),
            note: l.note ?? "",
          })),
        }}
      />
    </div>
  );
}
