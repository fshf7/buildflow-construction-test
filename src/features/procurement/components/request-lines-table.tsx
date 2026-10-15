import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { RequestDetail } from "../queries";

/** Строки заявки: заказано / принято / осталось / расхождение (Д-53). Цен и поставщиков в заявке нет (Д-92). */
export function RequestLinesTable({ request }: { request: RequestDetail }) {
  const showReceipt = request.status !== "DRAFT" && request.status !== "CANCELLED";
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>№</TableHead>
            <TableHead>Материал</TableHead>
            <TableHead>Комментарий</TableHead>
            <TableHead className="text-right">Заказано</TableHead>
            {showReceipt ? (
              <>
                <TableHead className="text-right">Принято</TableHead>
                <TableHead className="text-right">Осталось</TableHead>
                <TableHead className="text-right">Расхождение</TableHead>
              </>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {request.lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{l.lineNo}</TableCell>
              <TableCell>{l.materialName}</TableCell>
              <TableCell className="text-muted-foreground">{l.note ?? "—"}</TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
