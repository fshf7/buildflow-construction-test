/**
 * Подписи строк таблиц склада (Д-103) — общие для экрана и выгрузки в Excel (без "use client"
 * и "server-only"): поиск по тем же словам, что видны в строке.
 */
type IncomingLike = {
  kind: "receipt" | "opening";
  number: string | null;
  requestNumber: string | null;
  draft: { materialName: string };
};

/** «Основание» строки прихода: начальный остаток или заявка. */
export function incomingBasis(r: IncomingLike): string {
  if (r.kind === "opening") return `Начальный остаток · ${r.number ?? ""}`;
  return r.requestNumber ? `Заявка ${r.requestNumber}` : "";
}

export function incomingSearch(r: IncomingLike): string {
  return `${r.draft.materialName} ${r.number ?? ""} ${incomingBasis(r)}`;
}

type OutgoingLike = { kind: "issue" | "return"; materialName: string; issueNumber: string | null };

/** Наименование строки расхода: у возврата — «↩ Возврат: …». */
export function outgoingName(r: OutgoingLike): string {
  return r.kind === "return" ? `↩ Возврат: ${r.materialName}` : r.materialName;
}
