"use client";

import { useCallback, useState } from "react";

/**
 * Ключ идемпотентности формы (§6.2, Д-55): создаётся при открытии формы и не меняется при
 * повторной отправке (двойной тап, ретрай сети). Новый ключ — только для следующей операции.
 */
export function useIdempotencyKey() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setKey(crypto.randomUUID()), []);
  return { key, renew };
}

/** Идентификатор нового документа генерирует клиент: повтор сохранения не создаёт дубль. */
export function useDocumentId(existing?: string) {
  const [id] = useState(() => existing ?? crypto.randomUUID());
  return id;
}
