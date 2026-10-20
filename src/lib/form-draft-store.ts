/**
 * Несохранённый ввод формы документа — на устройстве (localStorage), чтобы переход в другой
 * раздел или перезагрузка не стирали набранные строки. Это удобство, не данные: в систему
 * документ попадает только по «Сохранить». Ключ — по участнику организации, чтобы на общем
 * компьютере другой пользователь (например, склад — без цен) не увидел чужой ввод.
 * Без "use client": ключ собирает серверная страница, хук — в ./form-draft.
 */
export const DRAFT_PREFIX = "bf.draft.v1.";
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Событие window после clearAllDrafts (выход): открытые формы бросают отложенную запись. */
export const DRAFTS_CLEARED_EVENT = "bf:drafts-cleared";

export type StoredDraft = { savedAt: number; values: Record<string, unknown> };

export function draftStorageKey(memberId: string, scope: string): string {
  return `${DRAFT_PREFIX}${memberId}.${scope}`;
}

/** Разбор сохранённого ввода: битое, просроченное или не похожее на форму документа — null. */
export function parseStoredDraft(raw: string | null, now: number): StoredDraft | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { savedAt, values } = parsed as Partial<StoredDraft>;
    if (typeof savedAt !== "number" || !values || typeof values !== "object") return null;
    if (!Array.isArray(values.lines)) return null;
    if (now - savedAt > DRAFT_TTL_MS) return null;
    return { savedAt, values };
  } catch {
    return null;
  }
}

type DraftStorage = Pick<Storage, "length" | "key" | "getItem" | "removeItem">;

function draftKeys(storage: DraftStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(DRAFT_PREFIX)) keys.push(key);
  }
  return keys;
}

/** Удаляет просроченный и битый ввод (в том числе других пользователей этого устройства). */
export function purgeExpiredDrafts(storage: DraftStorage, now: number): void {
  for (const key of draftKeys(storage)) {
    if (!parseStoredDraft(storage.getItem(key), now)) storage.removeItem(key);
  }
}

/** При выходе из системы: весь несохранённый ввод с устройства. */
export function clearAllDrafts(storage: DraftStorage): void {
  for (const key of draftKeys(storage)) storage.removeItem(key);
}
