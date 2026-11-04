"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useObject } from "@/components/object-context";
import { Pager, usePagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { BlockOption, Option } from "@/features/shared/lookups";
import { formatDate, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  cancelServiceRequest,
  closeServiceRequest,
  decideServiceRequest,
  saveServiceRequest,
} from "../actions";
import type { ServiceRequestRow, ServiceRequestStatus } from "../sheets";

import { QtyInput } from "./qty-input";
import type { ServiceOption } from "./services-sheet";

export const SERVICE_REQUEST_STATUS: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "На согласовании",
  APPROVED: "Согласована",
  REJECTED: "Отклонена",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

const STATUS_STYLE: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "border-amber-300 bg-amber-50 text-amber-900",
  APPROVED: "border-primary/40 bg-primary/10 text-primary",
  REJECTED: "border-destructive/40 bg-destructive/10 text-destructive",
  DONE: "border-emerald-300 bg-emerald-50 text-emerald-800",
  CANCELLED: "text-muted-foreground",
};

const select = "h-9 w-full rounded-md border bg-background px-2 text-sm";

/**
 * Заявки на услуги (Д-111) — необязательные, для дорогих услуг: склад или прораб (свои бригады)
 * оформляет → управляющий согласует или отклоняет → услугу заказывают вне системы → склад вносит
 * факт в «Журнал» со ссылкой на заявку («выполнено») → закрывает заявку.
 */
export function ServiceRequests({
  rows,
  services,
  blocks,
  stages,
  crews,
  ownCrews,
  canCreate,
  canApprove,
  canManage,
  userId,
}: {
  rows: ServiceRequestRow[];
  services: ServiceOption[];
  blocks: BlockOption[];
  stages: Option[];
  /** Все бригады — подписи. */
  crews: Option[];
  /** Бригады, для которых пользователь может оформить заявку (прорабу — свои). */
  ownCrews: Option[];
  canCreate: boolean;
  canApprove: boolean;
  /** Склад: отменить и закрыть любую заявку объекта (автор — свою). */
  canManage: boolean;
  userId: string;
}) {
  const paging = usePagination(rows.length);
  const [creating, setCreating] = useState(false);
  const [reason, setReason] = useState<{
    row: ServiceRequestRow;
    kind: "reject" | "cancel";
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const label = (list: Option[], id: string) => list.find((x) => x.id === id)?.label ?? "";

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const r = await action();
      if (r.ok) {
        toast.success(success);
        setReason(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Заявка необязательна — для дорогих услуг (кран, экскаватор). Факт выполнения — в
          «Журнале», строкой со ссылкой на заявку.
        </p>
        {canCreate ? (
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Новая заявка
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Заявок нет
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {paging.slice(rows).map((r) => {
            const block = blocks.find((b) => b.id === r.blockId);
            const place = [
              block?.name,
              block?.floors.find((f) => f.id === r.floorId)?.name &&
                `эт. ${block.floors.find((f) => f.id === r.floorId)?.name}`,
              label(stages, r.stageId),
            ]
              .filter(Boolean)
              .join(", ");
            const mine = r.createdBy === userId;
            const canDecide = canApprove && r.status === "SUBMITTED" && !mine;
            const canCancel =
              (canManage || mine) &&
              (r.status === "SUBMITTED" || r.status === "APPROVED") &&
              r.done === 0;
            const canClose = canManage && r.status === "APPROVED";
            return (
              <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.number}</span>
                    <Badge variant="outline" className={STATUS_STYLE[r.status]}>
                      {SERVICE_REQUEST_STATUS[r.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      от {formatDate(r.docDate)}
                      {r.author ? ` · ${r.author}` : ""}
                    </span>
                  </div>
                  <p className="text-sm">
                    <b>{r.service}</b> — {formatQuantity(r.quantity, r.unit)}
                    {r.plannedDate ? ` на ${formatDate(r.plannedDate)}` : ""}
                    {r.status === "APPROVED" || r.status === "DONE" ? (
                      <span
                        className={cn(
                          "ml-2 tabular-nums",
                          r.done > r.quantity
                            ? "font-medium text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        выполнено {formatQuantity(r.done, r.unit)} из{" "}
                        {formatQuantity(r.quantity, r.unit)}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[place, label(crews, r.crewId), r.note].filter(Boolean).join(" · ")}
                  </p>
                  {r.decisionComment ? (
                    <p className="text-xs">Управляющий: {r.decisionComment}</p>
                  ) : null}
                  {r.cancelReason ? (
                    <p className="text-xs">Причина отмены: {r.cancelReason}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canDecide ? (
                    <>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () =>
                              decideServiceRequest({
                                id: r.id,
                                key: crypto.randomUUID(),
                                approve: true,
                                comment: "",
                              }),
                            `Заявка ${r.number} согласована`,
                          )
                        }
                      >
                        Согласовать
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => setReason({ row: r, kind: "reject" })}
                      >
                        Отклонить
                      </Button>
                    </>
                  ) : null}
                  {canClose ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Закрыть заявку ${r.number}? Выполнено ${formatQuantity(r.done, r.unit)} из ${formatQuantity(r.quantity, r.unit)}; новые строки к ней не привязать.`,
                          )
                        )
                          run(() => closeServiceRequest(r.id), `Заявка ${r.number} закрыта`);
                      }}
                    >
                      Закрыть
                    </Button>
                  ) : null}
                  {canCancel ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => setReason({ row: r, kind: "cancel" })}
                    >
                      Отменить
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager paging={paging} />

      {creating ? (
        <NewRequestDialog
          services={services}
          blocks={blocks}
          stages={stages}
          crews={ownCrews}
          crewRequired={!canManage}
          onClose={() => setCreating(false)}
        />
      ) : null}

      <ReasonDialog
        title={
          reason?.kind === "reject"
            ? `Отклонить заявку ${reason.row.number}`
            : `Отменить заявку ${reason?.row.number ?? ""}`
        }
        pending={isPending}
        open={reason !== null}
        onClose={() => setReason(null)}
        onSubmit={(text) => {
          if (!reason) return;
          const row = reason.row;
          if (reason.kind === "reject")
            run(
              () =>
                decideServiceRequest({
                  id: row.id,
                  key: crypto.randomUUID(),
                  approve: false,
                  comment: text,
                }),
              `Заявка ${row.number} отклонена`,
            );
          else run(() => cancelServiceRequest(row.id, text), `Заявка ${row.number} отменена`);
        }}
      />
    </div>
  );
}

function ReasonDialog({
  title,
  open,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
        setText("");
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(text);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Причину увидят автор заявки и склад.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="request-reason">Причина</FieldLabel>
            <Input
              id="request-reason"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending || text.trim().length < 3}>
              {pending ? "Сохраняется…" : "Подтвердить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewRequestDialog({
  services,
  blocks,
  stages,
  crews,
  crewRequired,
  onClose,
}: {
  services: ServiceOption[];
  blocks: BlockOption[];
  stages: Option[];
  crews: Option[];
  crewRequired: boolean;
  onClose: () => void;
}) {
  const object = useObject();
  const router = useRouter();
  // id и ключ — на всё окно: повторная отправка не создаст вторую заявку.
  const [ids] = useState(() => ({ id: crypto.randomUUID(), key: crypto.randomUUID() }));
  const [v, setV] = useState({
    serviceId: "",
    quantity: "",
    plannedDate: "",
    blockId: "",
    floorId: "",
    stageId: "",
    crewId: crews.length === 1 ? crews[0]!.id : "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const service = services.find((s) => s.id === v.serviceId);
  const block = blocks.find((b) => b.id === v.blockId);
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await saveServiceRequest({ ...v, ...ids, projectId: object.id });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(`Заявка ${r.data.number} отправлена управляющему`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Новая заявка на услугу</DialogTitle>
            <DialogDescription>
              Управляющий согласует или отклонит. Факт выполнения склад внесёт в «Журнал».
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="sr-service">Услуга</FieldLabel>
            <select
              id="sr-service"
              className={select}
              value={v.serviceId}
              onChange={(e) => set({ serviceId: e.target.value })}
            >
              <option value="">— выберите —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="sr-qty">Сколько</FieldLabel>
              <QtyInput
                id="sr-qty"
                unit={service?.unitCode ?? ""}
                value={v.quantity}
                onChange={(e) => set({ quantity: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sr-date">Когда нужно</FieldLabel>
              <Input
                id="sr-date"
                type="date"
                value={v.plannedDate}
                onChange={(e) => set({ plannedDate: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sr-block">Блок</FieldLabel>
              <select
                id="sr-block"
                className={select}
                value={v.blockId}
                onChange={(e) => set({ blockId: e.target.value, floorId: "" })}
              >
                <option value="">—</option>
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="sr-floor">Этаж</FieldLabel>
              <select
                id="sr-floor"
                className={select}
                value={v.floorId}
                disabled={!block}
                onChange={(e) => set({ floorId: e.target.value })}
              >
                <option value="">—</option>
                {block?.floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="sr-stage">Этап работ</FieldLabel>
            <select
              id="sr-stage"
              className={select}
              value={v.stageId}
              onChange={(e) => set({ stageId: e.target.value })}
            >
              <option value="">—</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="sr-crew">
              Бригада{crewRequired ? "" : " (необязательно)"}
            </FieldLabel>
            <select
              id="sr-crew"
              className={select}
              value={v.crewId}
              onChange={(e) => set({ crewId: e.target.value })}
            >
              <option value="">—</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="sr-note">Комментарий</FieldLabel>
            <Input
              id="sr-note"
              placeholder="Например: кран 25 т, с 8:00"
              value={v.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              disabled={isPending || !v.serviceId || !v.quantity || (crewRequired && !v.crewId)}
            >
              {isPending ? "Отправляется…" : "Отправить на согласование"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
