import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ReverseAction } from "@/features/warehouse/components/warehouse-actions";
import { ISSUE_STATUS_LABELS } from "@/features/warehouse/labels";
import { getIssue } from "@/features/warehouse/queries";
import { requireOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { formatDate, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Выдача" };

export default async function IssuePage({ params }: PageProps<"/warehouse/issues/[id]">) {
  const org = await requireOrg();
  const { id } = await params;
  // RLS: склад видит выдачи объекта, прораб — только своих бригад.
  const issue = await getIssue(id);
  if (!issue) notFound();
  const canPost = hasPermission(org, "material_issues.post");

  return (
    <>
      <PageHeader
        title={issue.number ? `Выдача ${issue.number}` : "Выдача (черновик)"}
        description={`${issue.projectLabel} · ${formatDate(issue.docDate)}`}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={issue.status === "POSTED" ? "default" : "secondary"}>
          {ISSUE_STATUS_LABELS[issue.status]}
        </Badge>
        <span>
          {issue.crewName} · {issue.blockName}, этаж {issue.floorName}
          {issue.receivedByName ? ` · получил ${issue.receivedByName}` : ""}
        </span>
      </div>
      {issue.cancelReason ? <p className="text-sm">Причина сторно: {issue.cancelReason}</p> : null}
      <ul className="flex flex-col divide-y rounded-lg border">
        {issue.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 p-3">
            <span>{l.name}</span>
            <span className="font-medium tabular-nums">{formatQuantity(l.quantity, l.unit)}</span>
          </li>
        ))}
      </ul>
      {issue.returns.length > 0 ? (
        <section className="flex flex-col gap-1 text-sm">
          <h2 className="font-semibold">Возвраты</h2>
          {issue.returns.map((r) => (
            <Link
              key={r.id}
              href={`/warehouse/returns/${r.id}`}
              className="underline underline-offset-4"
            >
              {r.number ?? "Черновик"} — {ISSUE_STATUS_LABELS[r.status]}
            </Link>
          ))}
        </section>
      ) : null}
      {issue.status === "POSTED" && canPost ? (
        <div className="flex flex-wrap gap-2">
          <Link href={`/warehouse/return/${issue.id}`} className={buttonVariants()}>
            Оформить возврат
          </Link>
          <ReverseAction kind="issue" id={issue.id} />
        </div>
      ) : null}
    </>
  );
}
