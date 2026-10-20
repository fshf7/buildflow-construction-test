"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

import { DRAFTS_CLEARED_EVENT, parseStoredDraft, purgeExpiredDrafts } from "./form-draft-store";

const WRITE_DELAY_MS = 400;

/**
 * Автосохранение ввода формы на устройстве и восстановление при следующем открытии
 * (ключ — draftStorageKey из ./form-draft-store). Пишется только ввод пользователя:
 * reset при восстановлении/очистке не пишется.
 */
export function useFormDraft<T extends FieldValues>(form: UseFormReturn<T>, key: string) {
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // localStorage есть только в браузере: читаем после гидратации, иначе разметка сервера и клиента разойдётся.
  useEffect(() => {
    try {
      const now = Date.now();
      purgeExpiredDrafts(localStorage, now);
      const saved = parseStoredDraft(localStorage.getItem(key), now);
      if (!saved) return;
      form.reset(saved.values as T, { keepDefaultValues: true });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRestoredAt(saved.savedAt);
    } catch {
      /* без восстановления */
    }
  }, [form, key]);

  // Списки, зависящие от других полей (заявки объекта в накладной), получают пункты только после
  // рендера — повторно применяем значения, чтобы select показал восстановленный выбор.
  useEffect(() => {
    if (restoredAt !== null) form.reset(form.getValues(), { keepDefaultValues: true });
  }, [form, restoredAt]);

  useEffect(() => {
    let stopped = false;
    const write = () => {
      clearTimeout(timer.current);
      if (stopped || !pending.current) return;
      try {
        localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), values: pending.current }));
      } catch {
        /* переполнено или недоступно — без автосохранения */
      }
      pending.current = null;
    };
    const subscription = form.watch((values, { name }) => {
      if (!name) return; // reset — не ввод пользователя
      pending.current = values as T;
      clearTimeout(timer.current);
      timer.current = setTimeout(write, WRITE_DELAY_MS);
    });
    // Выход из системы: ввод уже стёрт — не дописывать его при размонтировании формы.
    const stop = () => {
      stopped = true;
      pending.current = null;
      clearTimeout(timer.current);
    };
    // Уход со страницы (переход по меню, закрытие вкладки) — дописываем последние символы сразу.
    window.addEventListener("pagehide", write);
    window.addEventListener(DRAFTS_CLEARED_EVENT, stop);
    return () => {
      window.removeEventListener("pagehide", write);
      window.removeEventListener(DRAFTS_CLEARED_EVENT, stop);
      subscription.unsubscribe();
      write();
    };
  }, [form, key]);

  /** После успешного сохранения в системе или по «Очистить форму». */
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = null;
    try {
      localStorage.removeItem(key);
    } catch {
      /* нечего чистить */
    }
    setRestoredAt(null);
  }, [key]);

  return { restoredAt, clear };
}
