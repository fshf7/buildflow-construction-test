import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/** Кнопка проведения, прилипшая к низу экрана — под большой палец (US-10). */
export function SubmitBar({
  pending,
  label,
  error,
  extra,
}: {
  pending: boolean;
  label: string;
  error: string | null;
  extra?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:mx-0 md:border-0 md:px-0">
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-14 w-full text-base" disabled={pending}>
        {pending ? "Проведение…" : label}
      </Button>
      {extra}
    </div>
  );
}
