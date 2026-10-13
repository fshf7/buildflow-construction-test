"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/features/catalog/components/form-dialog";

import { saveCrew } from "../actions";
import { crewSchema, type CrewInput } from "../schemas";

export type CrewRow = {
  id: string;
  name: string;
  leaderName: string | null;
  phone: string | null;
  foremanMemberId: string | null;
  foremanName: string | null;
  isActive: boolean;
};

function CrewForm({
  crew,
  foremen,
  onSaved,
}: {
  crew?: CrewRow;
  foremen: { id: string; label: string }[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CrewInput>({
    resolver: zodResolver(crewSchema),
    defaultValues: {
      id: crew?.id,
      name: crew?.name ?? "",
      leaderName: crew?.leaderName ?? "",
      phone: crew?.phone ?? "",
      foremanMemberId: crew?.foremanMemberId ?? "",
      isActive: crew?.isActive ?? true,
    },
  });
  const submit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveCrew(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Сохранено");
      onSaved();
      router.refresh();
    }),
  );
  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="crew-name">Название</FieldLabel>
          <Input id="crew-name" {...form.register("name")} />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="crew-leader">Бригадир</FieldLabel>
            <Input id="crew-leader" {...form.register("leaderName")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="crew-phone">Телефон</FieldLabel>
            <Input id="crew-phone" type="tel" inputMode="tel" {...form.register("phone")} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="crew-foreman">Ответственный прораб</FieldLabel>
          <NativeSelect
            id="crew-foreman"
            placeholder="Не назначен"
            options={foremen.map((f) => ({ value: f.id, label: f.label }))}
            {...form.register("foremanMemberId")}
          />
        </Field>
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="crew-active"
                checked={field.value}
                onCheckedChange={(on) => field.onChange(on === true)}
              />
              <FieldLabel htmlFor="crew-active" className="font-normal">
                Работает (снимите, чтобы убрать в архив)
              </FieldLabel>
            </Field>
          )}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохранение…" : "Сохранить"}
        </Button>
      </FieldGroup>
    </form>
  );
}

export function CrewsSection({
  crews,
  foremen,
  canManage,
}: {
  crews: CrewRow[];
  foremen: { id: string; label: string }[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {canManage ? (
        <div>
          <FormDialog
            trigger={
              <Button>
                <Plus />
                Добавить бригаду
              </Button>
            }
            title="Новая бригада"
          >
            {(close) => <CrewForm foremen={foremen} onSaved={close} />}
          </FormDialog>
        </div>
      ) : null}
      {crews.length === 0 ? (
        <p className="text-muted-foreground">Бригад пока нет.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {crews.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 p-3">
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 font-medium">
                  {c.name}
                  {c.isActive ? null : <Badge variant="secondary">Архив</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[c.leaderName, c.phone, c.foremanName ? `прораб: ${c.foremanName}` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </span>
              {canManage ? (
                <FormDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Изменить: ${c.name}`}>
                      <Pencil />
                    </Button>
                  }
                  title="Бригада"
                >
                  {(close) => <CrewForm crew={c} foremen={foremen} onSaved={close} />}
                </FormDialog>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
