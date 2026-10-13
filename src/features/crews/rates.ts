/** Тариф бригады (Д-70): история строками с датой начала; project null — для всех объектов. */
export type WorkRate = {
  id: string;
  crewId: string;
  projectId: string | null;
  workType: string;
  unitId: string;
  unit: string;
  rate: number;
  currency: string;
  validFrom: string;
};

/**
 * Действующие тарифы бригады на объекте на дату — по одному на вид работ. Повторяет
 * private.current_work_rate: тариф объекта важнее общего, внутри — последний по дате начала.
 * Только для подсказки в форме: в акт тариф подставляет БД.
 */
export function currentRates(
  rates: readonly WorkRate[],
  crewId: string,
  projectId: string,
  date: string,
): WorkRate[] {
  const best = new Map<string, WorkRate>();
  for (const r of rates) {
    if (r.crewId !== crewId || r.validFrom > date) continue;
    if (r.projectId !== null && r.projectId !== projectId) continue;
    const cur = best.get(r.workType);
    const better =
      !cur ||
      (cur.projectId === null && r.projectId !== null) ||
      ((cur.projectId === null) === (r.projectId === null) && r.validFrom > cur.validFrom);
    if (better) best.set(r.workType, r);
  }
  return [...best.values()].sort((a, b) => a.workType.localeCompare(b.workType, "ru"));
}

/**
 * Сумма строки как в БД: round(qty × rate, 2) по правилам NUMERIC (половина — от нуля).
 * Объём и тариф — до 4 знаков, поэтому считаем в целых (×10⁴ каждый) без ошибок двоичной арифметики.
 */
export function lineAmount(quantity: number, rate: number): number {
  const q = BigInt(Math.round(quantity * 10_000));
  const r = BigInt(Math.round(rate * 10_000));
  const product = q * r; // масштаб 10⁸
  const cents = (product + BigInt(500_000)) / BigInt(1_000_000); // до копеек, половина вверх (значения > 0)
  return Number(cents) / 100;
}
