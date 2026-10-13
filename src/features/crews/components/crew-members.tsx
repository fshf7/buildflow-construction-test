"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/catalog/components/form-dialog";

import { saveCrewMember } from "../actions";
import type { CrewMember } from "../queries";

function MemberForm({
  crewId,
  member,
  onSaved,
}: {
  crewId: string;
  member?: CrewMember;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState({
    fullName: member?.fullName ?? "",
    phone: member?.phone ?? "",
    position: member?.position ?? "",
    isActive: member?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveCrewMember({ id: member?.id, crewId, ...v });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Сохранено");
      onSaved();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="cm-name">ФИО</Label>
        <Input
          id="cm-name"
          value={v.fullName}
          onChange={(e) => setV({ ...v, fullName: e.target.value })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="cm-position">Должность</Label>
          <Input
            id="cm-position"
            value={v.position}
            onChange={(e) => setV({ ...v, position: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="cm-phone">Телефон</Label>
          <Input
            id="cm-phone"
            type="tel"
            inputMode="tel"
            value={v.phone}
            onChange={(e) => setV({ ...v, phone: e.target.value })}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="cm-active"
          checked={v.isActive}
          onCheckedChange={(on) => setV({ ...v, isActive: on === true })}
        />
        <Label htmlFor="cm-active" className="font-normal">
          Работает в бригаде
        </Label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохранение…" : "Сохранить"}
      </Button>
    </form>
  );
}

/** Состав бригады — люди бригады (не пользователи системы). */
export function CrewMembers({
  crewId,
  members,
  canManage,
}: {
  crewId: string;
  members: CrewMember[];
  canManage: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Состав</h2>
        {canManage ? (
          <FormDialog
            trigger={
              <Button variant="outline" size="sm">
                <Plus />
                Добавить
              </Button>
            }
            title="Человек в бригаде"
          >
            {(close) => <MemberForm crewId={crewId} onSaved={close} />}
          </FormDialog>
        ) : null}
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Состав не указан.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 p-3">
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 font-medium">
                  {m.fullName}
                  {m.isActive ? null : <Badge variant="secondary">Не работает</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[m.position, m.phone].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              {canManage ? (
                <FormDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Изменить: ${m.fullName}`}>
                      <Pencil />
                    </Button>
                  }
                  title="Человек в бригаде"
                >
                  {(close) => <MemberForm crewId={crewId} member={m} onSaved={close} />}
                </FormDialog>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
