import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceActions } from "@/features/procurement/components/invoice-actions";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONE } from "@/features/procurement/labels";
import { getInvoice } from "@/features/procurement/queries";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Накладная" };

const PAYABLE_LABELS: Record<string, string> = {
  OPEN: "К оплате",
  PARTIALLY_PAID: "Частично оплачено",
  PAID: "Оплачено",
  CANCELLED: "Отменено",
};

export default async function InvoicePage({ params }: PageProps<"/procurement/invoices/[id]">) {
  const org = await requirePermission("supplier_invoices.view");
  const { id } = await params;
  const withPrices = hasPermission(org, "prices.view");
  const invoice = await getInvoice(org.id, id, withPrices);
  if (!invoice) notFound();
  const canManage = hasPermission(org, "supplier_invoices.manage");

  return (
    <>
      <PageHeader
        title={invoice.number ? `Накладная ${invoice.number}` : "Накладная (введена)"}
        description={`${invoice.supplierName} · № ${invoice.supplierDocNumber} от ${formatDate(invoice.supplierDocDate)} · ${invoice.projectLabel}`}
        actions={
          invoice.status === "ENTERED" && canManage ? (
            <Link
              href={`/procurement/invoices/${id}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              Редактировать
            </Link>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant={INVOICE_STATUS_TONE[invoice.status]}>
          {INVOICE_STATUS_LABELS[invoice.status]}
        </Badge>
        {invoice.requestNumber && invoice.purchaseRequestId ? (
          <Link
            href={`/procurement/requests/${invoice.purchaseRequestId}`}
            className="underline underline-offset-4"
          >
            Заявка {invoice.requestNumber}
          </Link>
        ) : (
          <span className="text-muted-foreground">Без заявки</span>
        )}
        {invoice.confirmedAt ? (
          <span>Подтверждена {formatDateTime(invoice.confirmedAt)}</span>
        ) : null}
        {invoice.cancelReason ? (
          <span className="text-muted-foreground">Причина отмены: {invoice.cancelReason}</span>
        ) : null}
      </div>

      {canManage ? (
        <InvoiceActions
          id={invoice.id}
          status={invoice.status}
          hasNumber={Boolean(invoice.number)}
        />
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Материал / услуга</TableHead>
              <TableHead className="text-right">По накладной</TableHead>
              <TableHead className="text-right">Принято складом</TableHead>
              {withPrices ? (
                <>
                  <TableHead className="text-right">Цена</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                </>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lines.map((l) => {
              // Сверка (UNDER_REVIEW): количество в накладной и фактически принятое по строке заявки.
              const mismatch = l.received !== null && l.received !== l.quantity;
              return (
                <TableRow key={l.id}>
                  <TableCell>{l.materialName ?? l.description}</TableCell>
                  <TableCell className="text-right">{formatQuantity(l.quantity, l.unit)}</TableCell>
                  <TableCell className={cn("text-right", mismatch && "font-medium text-amber-700")}>
                    {l.received === null ? "—" : formatQuantity(l.received, l.unit)}
                  </TableCell>
                  {withPrices ? (
                    <>
                      <TableCell className="text-right">
                        {formatMoney(l.price, invoice.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(l.amount, invoice.currency)}
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
          {withPrices ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-right">
                  Итого
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatMoney(invoice.total, invoice.currency)}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {invoice.payable ? (
          <section className="flex flex-col gap-1 text-sm">
            <h2 className="font-semibold">Обязательство перед поставщиком</h2>
            <p>
              {PAYABLE_LABELS[invoice.payable.status] ?? invoice.payable.status}:{" "}
              {formatMoney(invoice.payable.amount, invoice.currency)}, оплачено{" "}
              {formatMoney(invoice.payable.paid, invoice.currency)}
            </p>
          </section>
        ) : null}
        {withPrices ? (
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Скан накладной</h2>
            <Attachments
              docType="SUPPLIER_INVOICE"
              docId={invoice.id}
              files={invoice.attachments}
              canUpload={canManage && invoice.status !== "CANCELLED"}
              revalidate={`/procurement/invoices/${invoice.id}`}
              label="Прикрепить скан"
            />
          </section>
        ) : null}
      </div>
    </>
  );
}
