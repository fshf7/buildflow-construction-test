import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ensureDocInObject, requireObject } from "@/features/projects/object";
import { WorkActActions } from "@/features/work-acts/components/act-actions";
import { WORK_ACT_STATUS_LABELS, WORK_ACT_STATUS_VARIANT } from "@/features/work-acts/labels";
import { getWorkAct, workActDuplicates } from "@/features/work-acts/queries";
import { hasPermission } from "@/lib/auth/access-model";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Акт работ" };

// TODO(TZ-open): обязательная форма акта не утверждена — пока печатная HTML-версия (Д-04).
export default async function WorkActPage({ params }: PageProps<"/objects/[projectId]/acts/[id]">) {
  const { projectId, id } = await params;
  const { org, project } = await requireObject(projectId);
  const user = await requireUser();
  const href = (path: string) => objectHref(project.id, path);
  // RLS: чужой объект или (для кассира) неутверждённый акт — не найден.
  const act = await getWorkAct(id);
  if (!act) notFound();
  ensureDocInObject(project.id, act.projectId, `/acts/${id}`);
  const isAuthor = act.createdBy === user.id;
  const duplicates =
    act.status === "DRAFT" || act.status === "REVIEW" ? await workActDuplicates(id) : [];
  const canPay =
    act.status === "APPROVED" &&
    act.payable &&
    act.payable.remaining > 0 &&
    hasPermission(org, "cash.post");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader
        title={act.number ? `Акт ${act.number}` : "Акт (черновик)"}
        description={`${act.crewName} · ${formatDate(act.docDate)}`}
        actions={<PrintButton />}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={WORK_ACT_STATUS_VARIANT[act.status]}>
          {WORK_ACT_STATUS_LABELS[act.status]}
        </Badge>
        {act.authorName ? (
          <span className="text-muted-foreground">Составил: {act.authorName}</span>
        ) : null}
        {act.periodFrom || act.periodTo ? (
          <span className="text-muted-foreground">
            Период: {formatDate(act.periodFrom)} — {formatDate(act.periodTo)}
          </span>
        ) : null}
      </div>
      {act.status === "REJECTED" && act.rejectReason ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <b>Отклонён:</b> {act.rejectReason}
        </p>
      ) : null}
      {act.status === "CANCELLED" && act.cancelReason ? (
        <p className="rounded-lg border p-3 text-sm">
          <b>Отменён:</b> {act.cancelReason}
        </p>
      ) : null}
      {duplicates.length > 0 ? (
        <section
          role="status"
          className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" aria-hidden />
            Возможный дубль — проверьте перед отправкой
          </p>
          {duplicates.map((d) => (
            <Link
              key={`${d.actId}:${d.workType}:${d.place}`}
              href={href(`/acts/${d.actId}`)}
              className="underline underline-offset-4"
            >
              {d.number ?? "черновик"} от {formatDate(d.docDate)} (
              {WORK_ACT_STATUS_LABELS[d.status]}): {d.workType}
              {d.place ? `, ${d.place}` : ""} — {formatQuantity(d.quantity)}
            </Link>
          ))}
        </section>
      ) : null}

      <ul className="flex flex-col divide-y rounded-lg border">
        {act.lines.map((l) => (
          <li key={l.id} className="flex flex-col gap-1 p-3 text-sm">
            <span className="font-medium">
              {l.workType}
              {l.place ? (
                <span className="font-normal text-muted-foreground"> · {l.place}</span>
              ) : null}
            </span>
            <span className="tabular-nums">
              {formatQuantity(l.quantity, l.unit)} × {formatMoney(l.rate, act.currency)} ={" "}
              <b>{formatMoney(l.amount, act.currency)}</b>
            </span>
            {l.note ? <span className="text-xs text-muted-foreground">{l.note}</span> : null}
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Итого</dt>
        <dd>
          <b data-testid="act-total">{formatMoney(act.total, act.currency)}</b>
        </dd>
        {act.payable ? (
          <>
            <dt className="text-muted-foreground">Оплачено</dt>
            <dd>{formatMoney(act.payable.paid, act.currency)}</dd>
            <dt className="text-muted-foreground">Долг по акту</dt>
            <dd>
              <b data-testid="act-debt">{formatMoney(act.payable.remaining, act.currency)}</b>
            </dd>
          </>
        ) : null}
        {act.note ? (
          <>
            <dt className="text-muted-foreground">Примечание</dt>
            <dd>{act.note}</dd>
          </>
        ) : null}
      </dl>
      {act.replaces ? (
        <p className="text-sm">
          Взамен акта{" "}
          <Link href={href(`/acts/${act.replaces.id}`)} className="underline underline-offset-4">
            {act.replaces.number}
          </Link>
        </p>
      ) : null}
      {act.replacedBy.length > 0 ? (
        <p className="text-sm">
          Исправлен актом:{" "}
          {act.replacedBy.map((r) => (
            <Link key={r.id} href={href(`/acts/${r.id}`)} className="underline underline-offset-4">
              {r.number ?? "черновик"}
            </Link>
          ))}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 print:hidden">
        {act.status === "DRAFT" && isAuthor ? (
          <Link
            href={href(`/acts/${act.id}/edit`)}
            className={buttonVariants({ variant: "outline" })}
          >
            Изменить черновик
          </Link>
        ) : null}
        {canPay ? (
          <Link
            href={href(`/finance/pay/crew/${act.crewId}`)}
            className={buttonVariants({ size: "lg" })}
          >
            Оплатить
          </Link>
        ) : null}
        <WorkActActions
          id={act.id}
          status={act.status}
          isAuthor={isAuthor}
          canCreate={hasPermission(org, "work_acts.create")}
          canApprove={hasPermission(org, "work_acts.approve")}
          paid={act.payable?.paid ?? 0}
        />
      </div>
    </div>
  );
}
