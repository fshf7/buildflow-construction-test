import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ReverseAction } from "@/features/warehouse/components/warehouse-actions";
import { ISSUE_STATUS_LABELS } from "@/features/warehouse/labels";
import { getReturn } from "@/features/warehouse/queries";
import { requireOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { formatDate, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Возврат" };

export default async function ReturnPage({ params }: PageProps<"/warehouse/returns/[id]">) {
  const org = await requireOrg();
  const { id } = await params;
  const ret = await getReturn(id);
  if (!ret) notFound();

  return (
    <>
      <PageHeader
        title={ret.number ? `Возврат ${ret.number}` : "Возврат (черновик)"}
        description={`${ret.crewName} · ${formatDate(ret.docDate)}`}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={ret.status === "POSTED" ? "default" : "secondary"}>
          {ISSUE_STATUS_LABELS[ret.status]}
        </Badge>
        <Link href={`/warehouse/issues/${ret.issueId}`} className="underline underline-offset-4">
          По выдаче {ret.issueNumber}
        </Link>
      </div>
      {ret.cancelReason ? <p className="text-sm">Причина сторно: {ret.cancelReason}</p> : null}
      <ul className="flex flex-col divide-y rounded-lg border">
        {ret.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 p-3">
            <span>{l.name}</span>
            <span className="font-medium tabular-nums">{formatQuantity(l.quantity, l.unit)}</span>
          </li>
        ))}
      </ul>
      {ret.status === "POSTED" && hasPermission(org, "material_issues.post") ? (
        <ReverseAction kind="return" id={ret.id} />
      ) : null}
    </>
  );
}
