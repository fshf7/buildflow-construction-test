import { serviceReconciliation } from "@/features/procurement/queries";
import { RECON_LABELS, reconcile } from "@/features/procurement/service-recon";
import { getProjectHeader } from "@/features/projects/queries";
import type { ReportRow } from "@/features/reports/definitions";
import { getCurrentOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { getCurrentUser } from "@/lib/auth/session";
import { attachment } from "@/lib/export/filename";
import { toXlsxBook } from "@/lib/export/xlsx";
import { businessToday } from "@/lib/format";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";

const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Сверка услуг (Д-112) в Excel — те же строки, что на экране. Под RLS пользователя. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/objects/[projectId]/procurement/services/export">,
) {
  const { projectId } = await ctx.params;
  const org = await getCurrentOrg();
  if (!org || !hasPermission(org, "supplier_invoices.view") || !hasPermission(org, "prices.view"))
    return new Response("Недостаточно прав", { status: 403 });
  const project = await getProjectHeader(projectId);
  if (!project || project.organizationId !== org.id)
    return new Response("Объект не найден", { status: 404 });
  const user = await getCurrentUser();
  const limit = await rateLimit([{ name: "export_user", value: user?.id ?? "anonymous" }]);
  if (!limit.ok)
    return new Response(tooManyMessage(limit.retryAfterSec), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec) },
    });

  const sp = new URL(request.url).searchParams;
  const today = businessToday();
  const from = isoDate(sp.get("from")) ?? `${today.slice(0, 8)}01`;
  const to = isoDate(sp.get("to")) ?? today;
  const rows = (await serviceReconciliation(project.id, from, to)).map((r) => {
    const { diff, status } = reconcile(r.used, r.invoiced);
    return {
      service: r.service,
      unit: r.unit,
      used: r.used,
      requested: r.requested,
      invoiced: r.invoiced,
      amount: r.currencies.length === 1 ? r.invoicedAmount : null,
      currency: r.currencies.join(", "),
      diff,
      status: RECON_LABELS[status],
    };
  });
  const buf = await toXlsxBook([
    {
      title: "Сверка услуг",
      columns: [
        { key: "service", label: "Услуга", kind: "text" },
        { key: "unit", label: "Ед. изм.", kind: "text" },
        { key: "used", label: "По журналу склада", kind: "qty" },
        { key: "requested", label: "По заявкам", kind: "qty" },
        { key: "invoiced", label: "В накладных", kind: "qty" },
        { key: "amount", label: "Сумма", kind: "money" },
        { key: "currency", label: "Валюта", kind: "text" },
        { key: "diff", label: "Разница", kind: "qty" },
        { key: "status", label: "Статус", kind: "text" },
      ],
      rows: rows as unknown as ReportRow[],
      totals: null,
    },
  ]);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": attachment(`sverka-uslug-${project.code}-${from}-${to}.xlsx`),
    },
  });
}
