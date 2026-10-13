import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { OpeningEditor } from "@/features/opening/components/opening-editor";
import { openingEditorData } from "@/features/opening/editor-data";
import { OPENING_KIND_LABELS, type OpeningKind } from "@/features/opening/schemas";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Ввод остатков" };

export default async function NewOpeningPage({ searchParams }: PageProps<"/opening/new">) {
  const org = await requirePermission("opening_balances.manage");
  const { kind } = await searchParams;
  if (kind !== "STOCK" && kind !== "CASH" && kind !== "PAYABLES") notFound();
  const data = await openingEditorData(org.id);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={`Ввод остатков: ${OPENING_KIND_LABELS[kind as OpeningKind].toLowerCase()}`}
      />
      <OpeningEditor kind={kind as OpeningKind} {...data} />
    </div>
  );
}
