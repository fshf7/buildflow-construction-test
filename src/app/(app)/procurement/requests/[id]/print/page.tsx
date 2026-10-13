import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/print-button";
import { getRequest } from "@/features/procurement/queries";
import { requirePermission } from "@/lib/auth/access";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Печать заявки" };

// US-01: печатная форма заявки (Д-04: HTML + print CSS; PDF — P1). Содержит цены → prices.view.
// TODO(TZ-open): утверждённая форма документа не определена — макет предварительный.
export default async function PrintRequestPage({
  params,
}: PageProps<"/procurement/requests/[id]/print">) {
  const org = await requirePermission("prices.view");
  const { id } = await params;
  const request = await getRequest(org.id, id, true);
  if (!request) notFound();

  return (
    <article className="mx-auto max-w-3xl bg-white p-8 text-black print:max-w-none print:p-0 [&_td]:border [&_td]:border-black [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-black [&_th]:px-2 [&_th]:py-1">
      <div className="mb-4 flex justify-end">
        <PrintButton />
      </div>
      <header className="mb-6">
        <p className="text-sm">{org.name}</p>
        <h1 className="mt-2 text-xl font-bold">Заявка на закупку № {request.number}</h1>
        <p className="text-sm">от {formatDate(request.docDate)}</p>
        <p className="mt-2 text-sm">
          Объект: <b>{request.projectLabel}</b>
          {request.neededBy ? <> · Нужно к: {formatDate(request.neededBy)}</> : null}
        </p>
      </header>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th>№</th>
            <th className="text-left">Материал</th>
            <th className="text-left">Поставщик</th>
            <th className="text-right">Кол-во</th>
            <th className="text-right">Цена</th>
            <th className="text-right">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {request.lines.map((l) => (
            <tr key={l.id}>
              <td className="text-center">{l.lineNo}</td>
              <td>{l.materialName}</td>
              <td>{l.supplierName ?? "—"}</td>
              <td className="text-right whitespace-nowrap">{formatQuantity(l.quantity, l.unit)}</td>
              <td className="text-right whitespace-nowrap">
                {formatMoney(l.price, request.currency)}
              </td>
              <td className="text-right whitespace-nowrap">
                {formatMoney(l.amount, request.currency)}
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} className="text-right font-bold">
              Итого
            </td>
            <td className="text-right font-bold whitespace-nowrap">
              {formatMoney(request.total, request.currency)}
            </td>
          </tr>
        </tbody>
      </table>
      {request.note ? <p className="mt-4 text-sm">Примечание: {request.note}</p> : null}
      <footer className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <p>Составил: ____________________</p>
        <p>Согласовал: ____________________</p>
      </footer>
    </article>
  );
}
