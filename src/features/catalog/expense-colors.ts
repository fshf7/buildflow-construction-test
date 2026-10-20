/**
 * Палитра цветов категорий затрат (Д-97) — ключи совпадают с CHECK в expense_categories.color.
 * Плашка категории в таблице «Затраты» — как цветной выпадающий список в Google Таблицах.
 */
export const EXPENSE_COLORS = {
  violet: {
    label: "Фиолетовый",
    pill: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  },
  blue: { label: "Синий", pill: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100" },
  teal: {
    label: "Бирюзовый",
    pill: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100",
  },
  green: {
    label: "Зелёный",
    pill: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  },
  amber: {
    label: "Жёлтый",
    pill: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  },
  orange: {
    label: "Оранжевый",
    pill: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100",
  },
  red: { label: "Красный", pill: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100" },
  gray: { label: "Серый", pill: "bg-muted text-foreground" },
} as const;

export type ExpenseColor = keyof typeof EXPENSE_COLORS;
export const EXPENSE_COLOR_KEYS = Object.keys(EXPENSE_COLORS) as [ExpenseColor, ...ExpenseColor[]];

export function colorPill(color: string): string {
  return (
    (EXPENSE_COLORS as Record<string, { pill: string }>)[color]?.pill ?? EXPENSE_COLORS.gray.pill
  );
}
