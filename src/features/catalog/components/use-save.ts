"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/actions/result";

/** Общая логика сохранения формы справочника: ошибка сервера, тост, обновление списка, закрытие. */
export function useSave(action: (input: unknown) => Promise<ActionResult>, onSaved: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(values: unknown) {
    setError(null);
    startTransition(async () => {
      const result = await action(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Сохранено");
      onSaved();
      router.refresh();
    });
  }

  return { save, error, isPending };
}
