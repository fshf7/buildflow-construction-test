import { AlertTriangle, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RequestActions } from "@/features/procurement/components/request-actions";
import { RequestLinesTable } from "@/features/procurement/components/request-lines-table";
import {
  INVOICE_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_TONE,
} from "@/features/procurement/labels";
import { getRequest } from "@/features/procurement/queries";
import { ensureDocInObject, requireObject } from "@/features/projects/object";
import { RECEIPT_STATUS_LABELS, type ReceiptStatus } from "@/features/warehouse/labels";
import { hasPermission } from "@/lib/auth/access-model";
import { formatDate } from "@/lib/format";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Заявка" };

export default async function RequestPage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/requests/[id]">) {
  const { projectId, id } = await params;
  const { org, project } = await requireObject(projectId, "purchase_requests.view");
  const request = await getRequest(org.id, id);
  if (!request) notFound();
  ensureDocInObject(project.id, request.projectId, `/warehouse/requests/${id}`);
  const href = (path: string) => objectHref(project.id, path);
  // Д-92: заявку оформляет склад (manage), сверяет и закрывает бухгалтер (review).
  const canManage = hasPermission(org, "purchase_requests.manage");
  const canReview = hasPermission(org, "purchase_requests.review");
  // Накладная по заявке — со ссылкой на неё (сверка BP-01); связь необязательна (Д-99).
  const canInvoice =
    hasPermission(org, "supplier_invoices.manage") &&
    !["DRAFT", "CANCELLED", "CLOSED"].includes(request.status);

  return (
    <>
      <PageHeader
        title={request.number ? `Заявка ${request.number}` : "Черновик заявки"}
        description={`от ${formatDate(request.docDate)}${request.neededBy ? ` · нужно к ${formatDate(request.neededBy)}` : ""}`}
        actions={
          <>
            {request.status === "DRAFT" && canManage ? (
              <Link
                href={href(`/warehouse/requests/${id}/edit`)}
                className={buttonVariants({ variant: "outline" })}
              >
                Редактировать
              </Link>
            ) : null}
            {request.number ? (
              <Link
                href={href(`/warehouse/requests/${id}/print`)}
                className={buttonVariants({ variant: "outline" })}
              >
                <Printer />
                Печать
              </Link>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={REQUEST_STATUS_TONE[request.status]}>
          {REQUEST_STATUS_LABELS[request.status]}
        </Badge>
        {request.hasDiscrepancy ? (
          <span className="flex items-center gap-1 text-sm text-amber-700">
            <AlertTriangle className="size-4" aria-hidden />
            Есть расхождение заказа и приёмки
          </span>
        ) : null}
        {request.statusComment ? (
          <span className="text-sm text-muted-foreground">
            Комментарий: {request.statusComment}
          </span>
        ) : null}
      </div>

      {canManage || canReview ? (
        <RequestActions
          id={request.id}
          status={request.status}
          canManage={canManage}
          canReview={canReview}
        />
      ) : null}

      <RequestLinesTable request={request} />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Накладные по заявке</h2>
          {request.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {request.invoices.map((v) => (
                <li key={v.id}>
                  <Link
                    href={href(`/procurement/invoices/${v.id}`)}
                    className="underline underline-offset-4"
                  >
                    {v.number ?? "Введена"} · {v.supplierName}
                    {v.supplierDocNumber ? ` · № ${v.supplierDocNumber}` : ""}
                  </Link>{" "}
                  — {INVOICE_STATUS_LABELS[v.status]}
                </li>
              ))}
            </ul>
          )}
          {canInvoice ? (
            <div>
              <Link
                href={href(`/procurement/invoices/new?request=${request.id}`)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Новая накладная
              </Link>
            </div>
          ) : null}
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Приёмки склада</h2>
          {request.receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {request.receipts.map((g) => (
                <li key={g.id}>
                  <Link
                    href={href(`/warehouse/receipts/${g.id}`)}
                    className="underline underline-offset-4"
                  >
                    {g.number ?? "Черновик"} · {g.supplierName} · {formatDate(g.docDate)}
                  </Link>{" "}
                  — {RECEIPT_STATUS_LABELS[g.status as ReceiptStatus]}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
