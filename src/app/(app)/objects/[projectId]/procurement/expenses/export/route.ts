import { listExpenseCategories } from "@/features/catalog/queries";
import {
  currencyLabel,
  filterExpenseRows,
  totalsByCurrency,
  type ExpenseFilters,
} from "@/features/procurement/expenses";
import { listExpenseRows } from "@/features/procurement/queries";
import { getProjectHeader } from "@/features/projects/queries";
import type { Column } from "@/features/reports/definitions";
import { getCurrentOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { getCurrentUser } from "@/lib/auth/session";
import { attachment } from "@/lib/export/filename";
import { toXlsx } from "@/lib/export/xlsx";
import { businessToday } from "@/lib/format";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";

/**
 * Экспорт журнала затрат в Excel (Д-97) — те же строки и фильтры, что на экране (общая функция
 * filterExpenseRows), под RLS пользователя; цены — только с prices.view.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/objects/[projectId]/procurement/expenses/export">,
) {
  const { projectId } = await ctx.params;
  const org = await getCurrentOrg();
  if (!org || !hasPermission(org, "supplier_invoices.view"))
    return new Response("Недостаточно прав", { status: 403 });
  const project = await getProjectHeader(projectId);
  if (!project || project.organizationId !== org.id)
    return new Response("Объект не найден", { status: 404 });
  const user = await getCurrentUser();
  const limit = await rateLimit([{ name: "export_user", value: user?.id ?? "anonymous" }]);
  if (!limit.ok) {
    return new Response(tooManyMessage(limit.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec) },
    });
  }

  const sp = new URL(request.url).searchParams;
  const filters: ExpenseFilters = {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    text: sp.get("text") ?? undefined,
    categoryId: sp.get("categoryId") ?? undefined,
    supplierId: sp.get("supplierId") ?? undefined,
    currency: sp.get("currency") ?? undefined,
    showCancelled: sp.get("showCancelled") === "true",
  };
  const prices = hasPermission(org, "prices.view");
  const [rows, categories] = await Promise.all([
    listExpenseRows(org.id, project.id, { prices }),
    listExpenseCategories(org.id),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const visible = filterExpenseRows(rows, filters);

  const columns: Column[] = [
    { key: "date", label: "Дата", kind: "date" },
    { key: "description", label: "Наименование", kind: "text" },
    { key: "category", label: "Категория", kind: "text" },
    { key: "quantity", label: "Кол-во", kind: "qty" },
    { key: "unit", label: "Ед. изм.", kind: "text" },
    ...(prices
      ? ([
          { key: "price", label: "Цена за ед.", kind: "money" },
          { key: "currency", label: "Валюта", kind: "text" },
          { key: "amount", label: "Сумма", kind: "money", total: true },
        ] satisfies Column[])
      : []),
    { key: "supplier", label: "Поставщик", kind: "text" },
    { key: "docNumber", label: "№ поставщика", kind: "text" },
    { key: "number", label: "Накладная", kind: "text" },
  ];
  const data = visible.map((r) => ({
    date: r.docDate,
    description: r.description,
    category: r.categoryId ? (categoryName.get(r.categoryId) ?? "") : "",
    quantity: r.quantity,
    unit: r.unitCode,
    price: r.price,
    currency: currencyLabel(r.currency),
    amount: r.status === "CANCELLED" ? 0 : r.amount,
    supplier: r.supplierName,
    docNumber: r.docNumber,
    number: r.number,
  }));
  // Итог — только если валюта одна (иначе суммы разных валют не складываются).
  const totals = totalsByCurrency(visible);
  const buf = await toXlsx(
    "Затраты",
    columns,
    data,
    prices && totals.length === 1 ? { amount: totals[0]!.total } : null,
  );
  return new Response(new Uint8Array(buf), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": attachment(`zatraty-${project.code}-${businessToday()}.xlsx`),
    },
  });
}
