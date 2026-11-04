/**
 * Сверка услуг (Д-112): использовано по журналу склада ↔ выставлено в накладных за период.
 * Без "server-only": логика покрыта Vitest. Только показывает расхождение, ничего не блокирует.
 */
export type ReconStatus = "ok" | "over" | "under";

export const RECON_LABELS: Record<ReconStatus, string> = {
  ok: "Сходится",
  over: "В счетах больше",
  under: "Выставлено не всё",
};

const round = (v: number) => Math.round(v * 10000) / 10000 || 0;

/** Разница «в накладных − использовано» и статус. */
export function reconcile(used: number, invoiced: number): { diff: number; status: ReconStatus } {
  const diff = round(invoiced - used);
  return { diff, status: diff === 0 ? "ok" : diff > 0 ? "over" : "under" };
}
