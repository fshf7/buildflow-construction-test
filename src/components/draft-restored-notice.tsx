"use client";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

/** Плашка над формой: ввод восстановлен с устройства (см. useFormDraft), в системе его ещё нет. */
export function DraftRestoredNotice({
  savedAt,
  onClear,
}: {
  savedAt: number;
  onClear: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-sm"
    >
      <span>
        Восстановлен несохранённый ввод от {formatDateTime(new Date(savedAt))}. Он хранится только
        на этом устройстве — сохраните, чтобы он попал в систему.
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onClear}>
        Очистить форму
      </Button>
    </div>
  );
}
