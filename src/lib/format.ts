/** Форматирование для интерфейса (ru-RU, часовой пояс Душанбе — Д: organizations.timezone). */
const TIME_ZONE = "Asia/Dushanbe";

const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? dateTimeFmt.format(new Date(value)) : "—";
}

const isoDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Бизнес-дата «сегодня» по Душанбе в формате YYYY-MM-DD — как private.today() в БД. */
export function businessToday(now: Date = new Date()): string {
  return isoDateFmt.format(now);
}

/** Дата без времени ('2026-10-12' из Postgres date) — без сдвига часового пояса. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : dateFmt.format(new Date(value));
}

/** Пустые строки из форм → null для необязательных колонок. */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const quantityFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });
const moneyFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 12,5 кг. Количество из Postgres numeric приходит строкой или числом. */
export function formatQuantity(
  value: number | string | null | undefined,
  unit?: string | null,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = quantityFmt.format(Number(value));
  return unit ? `${text} ${unit}` : text;
}

/** 1 234,50 TJS */
export function formatMoney(value: number | string | null | undefined, currency = "TJS"): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${moneyFmt.format(Number(value))} ${currency}`;
}

/** Инициалы для аватара: «Иван Петров» → «ИП», «ivan.petrov@site.tj» → «IP», «sklad» → «S». */
export function initials(name: string): string {
  const base = name.includes("@") ? name.slice(0, name.indexOf("@")) : name;
  const words = base.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w[0]!)
    .join("")
    .toUpperCase();
}
