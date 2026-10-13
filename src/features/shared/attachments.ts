"use server";

import { revalidatePath } from "next/cache";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { getCurrentOrg } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const DOC_TYPES = ["SUPPLIER_INVOICE", "GOODS_RECEIPT", "TASK", "WORK_ACT"] as const;
const isDocType = (v: unknown): v is (typeof DOC_TYPES)[number] =>
  (DOC_TYPES as readonly unknown[]).includes(v);
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

/**
 * Вложение к документу: файл в приватный bucket `documents` по пути {org}/{тип}/{документ}/…,
 * затем метаданные. Права — политики Storage и функция add_document_attachment (§5.4: сканы
 * накладных видит только prices.view, фото приёмки — склад).
 */
export async function uploadAttachment(formData: FormData): Promise<ActionResult> {
  const org = await getCurrentOrg();
  if (!org) return fail("Вы не состоите в организации");

  const docType = formData.get("docType");
  const docId = formData.get("docId");
  const file = formData.get("file");
  const back = formData.get("revalidate");
  if (!isDocType(docType) || typeof docId !== "string") {
    return fail("Неверный документ");
  }
  if (!(file instanceof File) || file.size === 0) return fail("Выберите файл");
  if (file.size > MAX_BYTES) return fail("Файл больше 10 МБ");
  if (!ALLOWED.includes(file.type)) return fail("Можно PDF или фото (JPEG, PNG, WebP, HEIC)");
  const user = await getCurrentUser();
  const limit = await rateLimit([{ name: "upload_user", value: user?.id ?? "anonymous" }]);
  if (!limit.ok) return fail(tooManyMessage(limit.retryAfterSec));

  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-80);
  const path = `${org.id}/${docType}/${docId}/${crypto.randomUUID()}-${safeName}`;
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError)
    return fail("Не удалось загрузить файл: недостаточно прав или документ недоступен");

  const { error } = await supabase.rpc("add_document_attachment", {
    p_doc_type: docType,
    p_doc_id: docId,
    p_storage_path: path,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("documents").remove([path]);
    return fail(dbErrorMessage(error));
  }
  if (typeof back === "string" && back.startsWith("/")) revalidatePath(back);
  return ok();
}
