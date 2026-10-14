"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useIdempotencyKey } from "@/lib/idempotency";

import { previewImport, runImport, type Preview } from "./actions";
import { IMPORT_KINDS, type ImportKind } from "./columns";

const STATUS = {
  new: { label: "Новая", variant: "default" },
  exists: { label: "Уже есть", variant: "secondary" },
  error: { label: "Ошибка", variant: "destructive" },
} as const;

/** Импорт справочника (Д-85): шаблон → файл → предпросмотр с ошибками по строкам → импорт. */
export function ImportWizard({ kind }: { kind: ImportKind }) {
  const router = useRouter();
  const def = IMPORT_KINDS[kind];
  const { key, renew } = useIdempotencyKey();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const errors = preview?.rows.filter((r) => r.status === "error").length ?? 0;
  const existing = preview?.rows.filter((r) => r.status === "exists").length ?? 0;
  const fresh = preview?.rows.filter((r) => r.status === "new").length ?? 0;

  function upload(file: File) {
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", file);
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await previewImport(data);
      if (!r.ok) {
        setError(r.error);
        setPreview(null);
        return;
      }
      setPreview(r.data);
      renew();
    });
  }

  function submit() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const r = await runImport({
        kind,
        key,
        mode,
        rows: preview.rows.map((r) => ({ row: r.row, ...r.values })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const text = `Готово: создано ${r.data.created}, обновлено ${r.data.updated}, пропущено ${r.data.skipped}.`;
      setResult(text);
      setPreview(null);
      toast.success(text);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          <a
            className="underline underline-offset-4"
            href={`/catalog/import/template?kind=${kind}`}
            download
          >
            Скачайте шаблон «{def.title}»
          </a>{" "}
          и заполните его в Excel (колонки:{" "}
          {def.columns.map((c) => c.header + (c.required ? "*" : "")).join(", ")}).
        </li>
        <li>Загрузите файл — покажем каждую строку и ошибки до записи.</li>
        <li>Импорт — всё или ничего: при ошибке не записывается ни одна строка.</li>
      </ol>

      <div className="flex flex-col gap-1">
        <Label htmlFor="import-file">Файл Excel (.xlsx, до 2 МБ)</Label>
        <input
          id="import-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="text-sm"
          disabled={isPending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <p role="status" className="text-sm font-medium">
          {result}
        </p>
      ) : null}

      {preview ? (
        <section className="flex flex-col gap-3">
          {preview.fileErrors.map((e) => (
            <p key={e.row} role="alert" className="text-sm text-destructive">
              Строка {e.row}: {e.message}
            </p>
          ))}
          <p className="text-sm" data-testid="import-summary">
            Строк: {preview.rows.length} — новых {fresh}, уже есть {existing}, с ошибками {errors}.
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="p-2 text-left">Строка</th>
                  {def.columns.map((c) => (
                    <th key={c.key} className="p-2 text-left">
                      {c.header}
                    </th>
                  ))}
                  <th className="p-2 text-left">Статус</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row} className="border-t align-top">
                    <td className="p-2 tabular-nums">{r.row}</td>
                    {def.columns.map((c) => (
                      <td key={c.key} className="p-2">
                        {r.values[c.key]}
                      </td>
                    ))}
                    <td className="p-2">
                      <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                      {r.messages.map((m) => (
                        <span key={m} className="block text-xs text-destructive">
                          {m}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {existing > 0 ? (
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="font-medium">Записи, которые уже есть</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "skip"}
                  onChange={() => setMode("skip")}
                />
                Пропустить (не менять)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "update"}
                  onChange={() => setMode("update")}
                />
                Обновить данными из файла (пустые ячейки не затирают заполненное)
              </label>
            </fieldset>
          ) : null}
          <div className="flex gap-2">
            <Button
              onClick={submit}
              disabled={isPending || errors > 0 || preview.rows.length === 0}
            >
              {isPending ? "Импорт…" : "Импортировать"}
            </Button>
            <button
              type="button"
              className={buttonVariants({ variant: "outline" })}
              onClick={() => setPreview(null)}
            >
              Отмена
            </button>
          </div>
          {errors > 0 ? (
            <p className="text-sm text-muted-foreground">
              Исправьте строки с ошибками в файле и загрузите его снова.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
