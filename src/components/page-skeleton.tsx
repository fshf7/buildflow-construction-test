/**
 * Экран загрузки страницы (loading.tsx, Д-96): показывается сразу после перехода, пока сервер
 * готовит данные, — переход ощущается мгновенным. Next подгружает его заранее для видимых ссылок.
 */
export function PageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Загрузка"
      className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <div className="h-8 w-56 max-w-full rounded-lg bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted" />
      </div>
      <div className="h-10 w-full rounded-lg bg-muted/70" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-14 w-full rounded-xl bg-muted/60" />
        ))}
      </div>
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}
