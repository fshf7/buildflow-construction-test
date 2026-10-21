"use client";

import { useMemo, useState } from "react";

import { useObject } from "@/components/object-context";
import {
  RowStatus,
  sheetCell,
  sheetHead,
  sheetInput,
  sheetNavigate,
  sheetTable,
  sheetText,
} from "@/components/sheet/sheet-kit";
import { useRowSheet, type SheetRow } from "@/components/sheet/use-row-sheet";
import type { BlockOption, MaterialOption, Option } from "@/features/shared/lookups";
import { toNumber } from "@/lib/decimal";
import { formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import { saveNorm } from "../actions";
import { normFields } from "../schemas";
import type { NormUsage } from "../sheets";

type NormDraft = {
  materialId: string;
  materialName: string;
  blockId: string;
  stageId: string;
  quantity: string;
};
type NormRow = SheetRow<NormDraft> & { issued: number; norm: number | null };

const lower = (s: string) => s.trim().toLocaleLowerCase("ru");
const num = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

/**
 * «Нормативы» (Д-100): сколько материала положено на блок и этап; выдано (выдачи − возвраты),
 * остаток и статус. Задаёт управляющий проектом; склад и бухгалтер видят. 0 — убрать норматив.
 */
export function NormsSheet({
  usage,
  materials,
  blocks,
  stages,
  canEdit,
}: {
  usage: NormUsage[];
  materials: MaterialOption[];
  blocks: BlockOption[];
  stages: Option[];
  canEdit: boolean;
}) {
  const object = useObject();
  const [text, setText] = useState("");
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const materialByName = useMemo(
    () => new Map(materials.map((m) => [lower(m.name), m])),
    [materials],
  );
  const blockName = (id: string) => blocks.find((b) => b.id === id)?.name ?? "";
  const stageName = (id: string) => stages.find((s) => s.id === id)?.label ?? "";

  const rows: NormRow[] = usage
    .map((u) => ({
      key: `${u.materialId}:${u.blockId}:${u.stageId}`,
      id: `${u.materialId}:${u.blockId}:${u.stageId}`,
      editable: canEdit,
      issued: u.issued,
      norm: u.norm,
      draft: {
        materialId: u.materialId,
        materialName: materialById.get(u.materialId)?.name ?? "",
        blockId: u.blockId,
        stageId: u.stageId,
        quantity: num(u.norm),
      },
    }))
    .sort(
      (a, b) =>
        a.draft.materialName.localeCompare(b.draft.materialName, "ru") ||
        blockName(a.draft.blockId).localeCompare(blockName(b.draft.blockId), "ru") ||
        stageName(a.draft.stageId).localeCompare(stageName(b.draft.stageId), "ru"),
    );

  const sheet = useRowSheet<NormDraft, NormDraft>({
    emptyDraft: () => ({
      id: crypto.randomUUID(),
      materialId: "",
      materialName: "",
      blockId: "",
      stageId: "",
      quantity: "",
    }),
    isBlank: (d) => !d.materialName.trim() && !d.quantity && !d.blockId && !d.stageId,
    same: (a, b) => a.quantity === b.quantity,
    validate: (d) => {
      const r = normFields.safeParse({ ...d, note: "" });
      if (r.success) return { ok: true, data: d };
      return {
        ok: false,
        fields: r.error.issues.map((i) =>
          String(i.path[0]) === "materialId" ? "materialName" : String(i.path[0]),
        ),
        message: `Заполните: ${[...new Set(r.error.issues.map((i) => i.message))].join(", ")}`,
      };
    },
    save: async (d) => {
      const r = await saveNorm({ ...d, note: "", projectId: object.id });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
  });

  const q = lower(text);
  const visible = rows.filter(
    (r) =>
      !q ||
      lower(
        `${r.draft.materialName} ${blockName(r.draft.blockId)} ${stageName(r.draft.stageId)}`,
      ).includes(q),
  );
  const existing = new Set(rows.map((r) => r.key));
  const fresh = canEdit
    ? sheet.fresh.filter(
        (d) => !existing.has(`${d.materialId}:${d.blockId}:${d.stageId}`) || !d.materialId,
      )
    : [];

  function status(norm: number | null, issued: number) {
    if (norm === null) return <span className="text-muted-foreground">Норматив не задан</span>;
    return issued > norm ? (
      <span className="font-medium text-destructive">Перерасход</span>
    ) : (
      <span className="text-emerald-700 dark:text-emerald-400">В норме</span>
    );
  }

  function renderRow(d: NormDraft & { id: string }, row?: NormRow) {
    const key = row?.key ?? d.id;
    const st = sheet.states[key];
    const bad = (f: string) => Boolean(st?.fields?.includes(f));
    const set = (patch: Partial<NormDraft>) =>
      row ? sheet.changeRow(row, patch) : sheet.changeNew(d.id, patch);
    const material = materialById.get(d.materialId);
    const norm = row ? (d.quantity ? toNumber(d.quantity) : null) : null;
    const left = row && norm !== null ? norm - row.issued : null;
    return (
      <tr
        key={key}
        className={cn("border-b last:border-b-0", !row && "bg-primary/[0.03]")}
        onBlur={(e) => {
          if (!canEdit || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          if (row) sheet.leaveRow(row);
          else sheet.leaveNew(d.id);
        }}
      >
        <td data-col="material" className={cn(sheetCell, "min-w-56")}>
          {row || !canEdit ? (
            <span className={sheetText}>{d.materialName}</span>
          ) : (
            <input
              aria-label="Материал"
              aria-invalid={bad("materialName")}
              list="norm-materials"
              className={sheetInput}
              placeholder="Новый норматив: материал"
              value={d.materialName}
              onChange={(e) =>
                set({
                  materialName: e.target.value,
                  materialId: materialByName.get(lower(e.target.value))?.id ?? "",
                })
              }
            />
          )}
        </td>
        <td className={cn(sheetCell, "w-16 px-2 text-muted-foreground")}>{material?.unit ?? ""}</td>
        <td data-col="block" className={cn(sheetCell, "w-28")}>
          {row || !canEdit ? (
            <span className={sheetText}>{blockName(d.blockId)}</span>
          ) : (
            <select
              aria-label="Блок"
              aria-invalid={bad("blockId")}
              className={sheetInput}
              value={d.blockId}
              onChange={(e) => set({ blockId: e.target.value })}
            >
              <option value="">—</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </td>
        <td data-col="stage" className={cn(sheetCell, "w-48")}>
          {row || !canEdit ? (
            <span className={sheetText}>{stageName(d.stageId)}</span>
          ) : (
            <select
              aria-label="Этап"
              aria-invalid={bad("stageId")}
              className={sheetInput}
              value={d.stageId}
              onChange={(e) => set({ stageId: e.target.value })}
            >
              <option value="">—</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </td>
        <td data-col="norm" className={cn(sheetCell, "w-28")}>
          {canEdit ? (
            <input
              aria-label="Норматив"
              aria-invalid={bad("quantity")}
              inputMode="decimal"
              className={cn(sheetInput, "text-right tabular-nums")}
              value={d.quantity}
              onChange={(e) => set({ quantity: e.target.value })}
            />
          ) : (
            <span className={cn(sheetText, "text-right tabular-nums")}>{d.quantity}</span>
          )}
        </td>
        <td className={cn(sheetCell, "w-24 px-2 text-right tabular-nums")}>
          {row ? formatQuantity(row.issued) : ""}
        </td>
        <td
          className={cn(
            sheetCell,
            "w-24 px-2 text-right tabular-nums",
            left !== null && left < 0 && "bg-destructive/10 font-medium text-destructive",
          )}
        >
          {left !== null ? formatQuantity(Math.round(left * 10000) / 10000) : ""}
        </td>
        <td className={cn(sheetCell, "w-40 px-2 text-sm")}>
          {row ? status(norm, row.issued) : ""}
        </td>
        <td className={cn(sheetCell, "w-10 text-center")}>
          <RowStatus state={st} />
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Поиск"
          placeholder="Поиск: материал, блок, этап"
          className="h-8 w-64 rounded-md border bg-background px-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="ml-auto text-sm text-muted-foreground">Строк: {visible.length}</span>
      </div>
      <datalist id="norm-materials">
        {materials.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <table className={sheetTable} onKeyDown={sheetNavigate}>
          <thead className="sticky top-0 z-[2] bg-muted">
            <tr>
              <th className={sheetHead}>Материал</th>
              <th className={sheetHead}>Ед.</th>
              <th className={sheetHead}>Блок</th>
              <th className={sheetHead}>Этап</th>
              <th className={cn(sheetHead, "text-right")}>Норматив</th>
              <th className={cn(sheetHead, "text-right")}>Выдано</th>
              <th className={cn(sheetHead, "text-right")}>Остаток</th>
              <th className={sheetHead}>Статус</th>
              <th className={sheetHead} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && fresh.length === 0 ? (
              <tr>
                <td colSpan={9} className="h-20 text-center text-muted-foreground">
                  Нормативов пока нет
                </td>
              </tr>
            ) : null}
            {visible.map((r) => renderRow({ ...sheet.draftOf(r), id: r.id }, r))}
            {fresh.map((d) => renderRow(d))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {canEdit
          ? "Норматив — на материал, блок и этап. Строка сохраняется, когда вы уходите с неё; 0 — убрать норматив. Выдано считается по «Расходу» (минус возвраты)."
          : "Нормативы задаёт управляющий проектом. Выдано — по «Расходу» (минус возвраты)."}
      </p>
    </div>
  );
}
