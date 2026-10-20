import type { Metadata } from "next";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { requireObject } from "@/features/projects/object";
import { JournalTable } from "@/features/warehouse/components/journal-table";
import { listJournal } from "@/features/warehouse/queries";
import { hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Журнал склада" };

export default async function JournalPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/warehouse/journal">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  const { kind } = await searchParams;
  const ownCrewsOnly = !hasPermission(org, "stock.view");
  // Прораб видит выдачи и возвраты своих бригад (RLS, Д-26) — по этому объекту (Д-94).
  const kindValue =
    typeof kind === "string" && ["receipt", "issue", "return"].includes(kind) ? kind : undefined;
  const rows = await listJournal(
    project.id,
    ownCrewsOnly && kindValue === "receipt" ? "issue" : kindValue,
  );

  return (
    <>
      <PageHeader
        title={ownCrewsOnly ? "Выдачи моих бригад" : "Журнал склада"}
        description={
          ownCrewsOnly
            ? "Выдачи и возвраты материалов бригадам, за которые вы отвечаете."
            : project.label
        }
      />
      <FiltersBar
        fields={[
          {
            name: "kind",
            label: "Документ",
            type: "select",
            options: [
              ...(ownCrewsOnly ? [] : [{ value: "receipt", label: "Приёмки" }]),
              { value: "issue", label: "Выдачи" },
              { value: "return", label: "Возвраты" },
            ],
          },
        ]}
      />
      <JournalTable rows={rows} />
    </>
  );
}
