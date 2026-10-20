// Остатки, журнал и операции склада работают с телефона: узкая колонка и крупные элементы (US-10).
export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">{children}</div>;
}
