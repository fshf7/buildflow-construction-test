import { canSeeReport, findReport, loadReport } from "@/features/reports/definitions";
import { getCurrentOrg } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";
import { businessToday } from "@/lib/format";
import { toCsv } from "@/lib/export/csv";
import { toXlsx } from "@/lib/export/xlsx";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";

/**
 * Экспорт отчёта (CSV/XLSX). Права — как у страницы (Д-75); данные — те же функции под RLS
 * пользователя, поэтому файл содержит ровно то, что он видит на экране.
 */
export async function GET(request: Request, ctx: RouteContext<"/reports/[report]/export">) {
  const { report } = await ctx.params;
  const def = findReport(report);
  if (!def) return new Response("Отчёт не найден", { status: 404 });
  const org = await getCurrentOrg();
  if (!org || !canSeeReport(org, def)) return new Response("Недостаточно прав", { status: 403 });
  const user = await getCurrentUser();
  const limit = await rateLimit([{ name: "export_user", value: user?.id ?? "anonymous" }]);
  if (!limit.ok) {
    return new Response(tooManyMessage(limit.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec) },
    });
  }

  const url = new URL(request.url);
  const p = Object.fromEntries(url.searchParams.entries());
  const data = await loadReport(def, org.id, p);
  const name = `${def.key}-${businessToday()}`;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

  if (p.format === "xlsx") {
    const buf = await toXlsx(def.title, data.columns, data.rows, data.totals);
    return new Response(new Uint8Array(buf), {
      headers: {
        ...headers,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  }
  return new Response(toCsv(data.columns, data.rows, data.totals), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
