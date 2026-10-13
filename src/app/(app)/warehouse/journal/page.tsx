import type { Metadata } from "next";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { JournalTable } from "@/features/warehouse/components/journal-table";
import { resolveProject } from "@/features/warehouse/context";
import { listJournal } from "@/features/warehouse/queries";
import { requireOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Журнал склада" };

export default async function JournalPage({ searchParams }: PageProps<"/warehouse/journal">) {
  const org = await requireOrg();
  const { project: requested, kind } = await searchParams;
  const ownCrewsOnly = !hasPermission(org, "stock.view");
  const { projects, project } = await resolveProject(org.id, requested);
  // Прораб видит выдачи и возвраты своих бригад по всем объектам (RLS, Д-26).
  const kindValue =
    typeof kind === "string" && ["receipt", "issue", "return"].includes(kind) ? kind : undefined;
  const rows = await listJournal(
    ownCrewsOnly ? null : (project?.id ?? null),
    ownCrewsOnly && kindValue === "receipt" ? "issue" : kindValue,
  );

  return (
    <>
      <PageHeader
        title={ownCrewsOnly ? "Выдачи моих бригад" : "Журнал склада"}
        description={
          ownCrewsOnly
            ? "Выдачи и возвраты материалов бригадам, за которые вы отвечаете."
            : project?.label
        }
      />
      <FiltersBar
        fields={[
          ...(ownCrewsOnly
            ? []
            : [
                {
                  name: "project",
                  label: "Объект",
                  type: "select" as const,
                  options: projects.map((p) => ({ value: p.id, label: p.label })),
                },
              ]),
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
