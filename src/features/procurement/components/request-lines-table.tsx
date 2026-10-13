import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { RequestDetail } from "../queries";

/** Строки заявки: заказано / принято / осталось / расхождение (Д-53); цены — только с prices.view. */
export function RequestLinesTable({
  request,
  withPrices,
}: {
  request: RequestDetail;
  withPrices: boolean;
}) {
  const showReceipt = request.status !== "DRAFT" && request.status !== "CANCELLED";
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>№</TableHead>
            <TableHead>Материал</TableHead>
            <TableHead>Поставщик</TableHead>
            <TableHead className="text-right">Заказано</TableHead>
            {showReceipt ? (
              <>
                <TableHead className="text-right">Принято</TableHead>
                <TableHead className="text-right">Осталось</TableHead>
                <TableHead className="text-right">Расхождение</TableHead>
              </>
            ) : null}
            {withPrices ? (
              <>
                <TableHead className="text-right">Цена</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
              </>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {request.lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{l.lineNo}</TableCell>
              <TableCell>{l.materialName}</TableCell>
              <TableCell>{l.supplierName ?? "—"}</TableCell>
              <TableCell className="text-right">{formatQuantity(l.quantity, l.unit)}</TableCell>
              {showReceipt ? (
                <>
                  <TableCell className="text-right">{formatQuantity(l.received, l.unit)}</TableCell>
                  <TableCell className="text-right">
                    {formatQuantity(l.remaining, l.unit)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      l.diff > 0 && "font-medium text-amber-700",
                      l.diff < 0 && "text-muted-foreground",
                    )}
                  >
                    {l.received > 0 && l.diff !== 0
                      ? `${l.diff > 0 ? "+" : ""}${formatQuantity(l.diff, l.unit)}`
                      : "—"}
                  </TableCell>
                </>
              ) : null}
              {withPrices ? (
                <>
                  <TableCell className="text-right">
                    {l.price === null ? "—" : formatMoney(l.price, request.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.amount === null ? "—" : formatMoney(l.amount, request.currency)}
                  </TableCell>
                </>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
        {withPrices ? (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={showReceipt ? 8 : 5} className="text-right">
                Итого
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatMoney(request.total, request.currency)}
              </TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}
