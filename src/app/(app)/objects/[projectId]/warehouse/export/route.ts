import { listServices, listWorkStages } from "@/features/catalog/queries";
import { getProjectHeader } from "@/features/projects/queries";
import type { Column, ReportRow } from "@/features/reports/definitions";
import { listBlockOptions, listResponsibleOptions } from "@/features/shared/lookups";
import { filterReport, parseReportParams } from "@/features/warehouse/report-filter";
import { incomingBasis, incomingSearch, outgoingName } from "@/features/warehouse/sheet-labels";
import {
  listIncomingRows,
  listOutgoingRows,
  listServiceRows,
  normStatus,
  warehouseOutgoing,
  warehouseReport,
} from "@/features/warehouse/sheets";
import { filterSheetRows } from "@/components/sheet/filter";
import { getCurrentOrg } from "@/lib/auth/access";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { getCurrentUser } from "@/lib/auth/session";
import { attachment } from "@/lib/export/filename";
import { toXlsxBook, type XlsxSheet } from "@/lib/export/xlsx";
import { businessToday } from "@/lib/format";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";

const qty = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/**
 * Выгрузка склада в Excel (Д-100): приход, расход, услуги — те же строки и фильтры, что на экране;
 * отчёт за период — книга из трёх листов. Под RLS пользователя; цен в складе нет (§5.4).
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/objects/[projectId]/warehouse/export">,
) {
  const { projectId } = await ctx.params;
  const org = await getCurrentOrg();
  if (!org || !hasAnyPermission(org, ["stock.view", "stock.view_own_crews"]))
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
  const sheet = sp.get("sheet");
  const f = {
    from: isoDate(sp.get("from")),
    to: isoDate(sp.get("to")),
    text: sp.get("text") ?? undefined,
  };
  const stock = hasPermission(org, "stock.view");
  let sheets: XlsxSheet[];
  let name: string;

  if (sheet === "incoming" && stock) {
    const rows = filterSheetRows(
      await listIncomingRows(project.id),
      f,
      (r) => r.draft.docDate,
      incomingSearch,
    );
    name = "prihod";
    sheets = [
      {
        title: "Приход",
        columns: [
          { key: "date", label: "Дата", kind: "date" },
          { key: "material", label: "Наименование", kind: "text" },
          { key: "quantity", label: "Кол-во", kind: "qty" },
          { key: "unit", label: "Ед. изм.", kind: "text" },
          { key: "basis", label: "Основание", kind: "text" },
        ],
        rows: rows.map((r) => ({
          date: r.draft.docDate,
          material: r.draft.materialName,
          quantity: qty(r.draft.quantity),
          unit: r.unitCode,
          basis: incomingBasis(r),
        })),
        totals: null,
      },
    ];
  } else if (sheet === "outgoing" || sheet === "services") {
    const [blocks, stages, crews] = await Promise.all([
      listBlockOptions(project.id),
      listWorkStages(org.id),
      listResponsibleOptions(org.id),
    ]);
    const block = (id: string) => blocks.find((b) => b.id === id);
    const floor = (b: string, id: string) => block(b)?.floors.find((x) => x.id === id)?.name ?? "";
    const stage = (id: string) => stages.find((s) => s.id === id)?.name ?? "";
    const crew = (id: string) => crews.find((c) => c.id === id)?.label ?? "";
    if (sheet === "outgoing") {
      const rows = filterSheetRows(
        await listOutgoingRows(project.id),
        f,
        (r) => r.draft.docDate,
        (r) =>
          `${outgoingName(r)} ${block(r.draft.blockId)?.name ?? ""} ${stage(r.draft.stageId)} ${crew(r.draft.crewId)} ${r.number ?? ""} ${r.issueNumber ?? ""}`,
      );
      name = "rashod";
      sheets = [
        {
          title: "Расход",
          columns: [
            { key: "date", label: "Дата", kind: "date" },
            { key: "material", label: "Наименование", kind: "text" },
            { key: "block", label: "Блок", kind: "text" },
            { key: "floor", label: "Этаж", kind: "text" },
            { key: "stage", label: "Этап", kind: "text" },
            { key: "quantity", label: "Кол-во", kind: "qty" },
            { key: "unit", label: "Ед. изм.", kind: "text" },
            { key: "crew", label: "Ответственный", kind: "text" },
          ],
          rows: rows.map((r) => ({
            date: r.draft.docDate,
            material: outgoingName(r),
            block: block(r.draft.blockId)?.name ?? "",
            floor: floor(r.draft.blockId, r.draft.floorId),
            stage: stage(r.draft.stageId),
            quantity: qty(r.draft.quantity),
            unit: r.unitCode,
            crew: crew(r.draft.crewId),
          })),
          totals: null,
        },
      ];
    } else {
      const services = await listServices(org.id);
      const rows = filterSheetRows(
        await listServiceRows(project.id),
        f,
        (r) => r.draft.docDate,
        (r) =>
          `${r.draft.serviceName} ${block(r.draft.blockId)?.name ?? ""} ${stage(r.draft.stageId)} ${crew(r.draft.crewId)}`,
      );
      name = "uslugi";
      sheets = [
        {
          title: "Услуги",
          columns: [
            { key: "date", label: "Дата", kind: "date" },
            { key: "service", label: "Услуга", kind: "text" },
            { key: "quantity", label: "Кол-во", kind: "qty" },
            { key: "unit", label: "Ед.", kind: "text" },
            { key: "block", label: "Блок", kind: "text" },
            { key: "floor", label: "Этаж", kind: "text" },
            { key: "stage", label: "Этап", kind: "text" },
            { key: "crew", label: "Бригада", kind: "text" },
          ],
          rows: rows.map((r) => ({
            date: r.draft.docDate,
            service:
              r.draft.serviceName || services.find((s) => s.id === r.draft.serviceId)?.name || "",
            quantity: qty(r.draft.quantity),
            unit: r.unitCode,
            block: block(r.draft.blockId)?.name ?? "",
            floor: floor(r.draft.blockId, r.draft.floorId),
            stage: stage(r.draft.stageId),
            crew: crew(r.draft.crewId),
          })),
          totals: null,
        },
      ];
    }
  } else if (sheet === "report" && stock) {
    const today = businessToday();
    const from = f.from ?? `${today.slice(0, 8)}01`;
    const to = f.to ?? today;
    // Д-107: фильтры текущей вкладки отчёта — к её листу.
    const { view, filter, crew } = parseReportParams((k) => sp.get(k));
    const [full, crewOutgoing] = await Promise.all([
      warehouseReport(project.id, from, to),
      crew ? warehouseOutgoing(project.id, from, to, crew) : null,
    ]);
    const r = filterReport(crewOutgoing ? { ...full, outgoing: crewOutgoing } : full, view, filter);
    name = `otchet-${from}-${to}`;
    const cols = (c: [string, string, Column["kind"]][]): Column[] =>
      c.map(([key, label, kind]) => ({ key, label, kind }));
    sheets = [
      {
        title: "Приход за период",
        columns: cols([
          ["material", "Материал", "text"],
          ["unit", "Ед. изм.", "text"],
          ["quantity", "Кол-во за период", "qty"],
        ]),
        rows: r.incoming as unknown as ReportRow[],
        totals: null,
      },
      {
        title: "Расход за период",
        columns: cols([
          ["material", "Материал", "text"],
          ["block", "Блок", "text"],
          ["floor", "Этаж", "text"],
          ["stage", "Этап работ", "text"],
          ["quantity", "Расход", "qty"],
          ["unit", "Ед. изм.", "text"],
          ["norm", "Норматив", "qty"],
          ["deviation", "Отклонение", "qty"],
          ["status", "Статус", "text"],
        ]),
        rows: r.outgoing.map((o) => ({
          ...o,
          deviation: o.norm !== null && o.normIssued !== null ? o.normIssued - o.norm : null,
          status: normStatus(o.norm, o.normIssued),
        })) as unknown as ReportRow[],
        totals: null,
      },
      {
        title: "Остаток на конец",
        columns: cols([
          ["material", "Материал", "text"],
          ["unit", "Ед. изм.", "text"],
          ["incoming", "Приход всего", "qty"],
          ["outgoing", "Расход всего", "qty"],
          ["balance", "Остаток", "qty"],
        ]),
        rows: r.balance as unknown as ReportRow[],
        totals: null,
      },
    ];
  } else {
    return new Response("Неизвестная таблица или недостаточно прав", { status: 400 });
  }

  const buf = await toXlsxBook(sheets);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": attachment(`sklad-${name}-${project.code}-${businessToday()}.xlsx`),
    },
  });
}
