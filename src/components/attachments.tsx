"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadAttachment } from "@/features/shared/attachments";

/** Вложения документа: список (подписанные ссылки на 5 минут) и загрузка файла/фото с телефона. */
export function Attachments({
  docType,
  docId,
  files,
  canUpload,
  revalidate,
  label = "Прикрепить файл",
}: {
  docType: "SUPPLIER_INVOICE" | "GOODS_RECEIPT" | "TASK" | "WORK_ACT";
  docId: string;
  files: { id: string; fileName: string; url: string | null }[];
  canUpload: boolean;
  revalidate: string;
  label?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function upload(file: File) {
    const data = new FormData();
    data.set("docType", docType);
    data.set("docId", docId);
    data.set("file", file);
    data.set("revalidate", revalidate);
    startTransition(async () => {
      const result = await uploadAttachment(data);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Файл прикреплён");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Файлов нет</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <Paperclip className="size-4 shrink-0" aria-hidden />
              {f.url ? (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  {f.fileName}
                </a>
              ) : (
                f.fileName
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload ? (
        <div className="print:hidden">
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/*"
            capture="environment"
            className="sr-only"
            aria-label={label}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
          <Button variant="outline" disabled={isPending} onClick={() => input.current?.click()}>
            <Paperclip />
            {isPending ? "Загрузка…" : label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
