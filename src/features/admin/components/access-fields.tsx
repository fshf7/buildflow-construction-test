"use client";

import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormSetValue,
  useWatch,
} from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { defaultAllProjects, ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/auth/permissions";

import type { ProjectOption } from "../queries";

type AccessValues = { roles: RoleCode[]; allProjects: boolean; projectIds: string[] };

/** Роли и объекты участника — общий блок формы приглашения и редактирования. */
export function AccessFields<T extends AccessValues>({
  control,
  errors,
  setValue,
  projects,
}: {
  control: Control<T>;
  errors: FieldErrors<T>;
  setValue: UseFormSetValue<T>;
  projects: ProjectOption[];
}) {
  // react-hook-form не выводит пути из обобщённого T — работаем через приведённые типы.
  const c = control as unknown as Control<AccessValues>;
  const set = setValue as unknown as UseFormSetValue<AccessValues>;
  const e = errors as FieldErrors<AccessValues>;
  const allProjects = useWatch({ control: c, name: "allProjects" });

  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">Роли</FieldLegend>
        <Controller
          control={c}
          name="roles"
          render={({ field }) => (
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLE_CODES.map((code) => {
                const checked = field.value.includes(code);
                return (
                  <Field key={code} orientation="horizontal">
                    <Checkbox
                      id={`role-${code}`}
                      checked={checked}
                      onCheckedChange={(on) => {
                        const next = on
                          ? [...field.value, code]
                          : field.value.filter((r) => r !== code);
                        field.onChange(next);
                        // Д-27: финансовым ролям и администратору по умолчанию — все объекты.
                        set("allProjects", defaultAllProjects(next), { shouldDirty: true });
                      }}
                    />
                    <FieldLabel htmlFor={`role-${code}`} className="font-normal">
                      {ROLE_LABELS[code]}
                    </FieldLabel>
                  </Field>
                );
              })}
            </div>
          )}
        />
        <FieldError errors={[e.roles as { message?: string } | undefined]} />
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Объекты</FieldLegend>
        <Controller
          control={c}
          name="allProjects"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="all-projects"
                checked={field.value}
                onCheckedChange={(on) => field.onChange(on === true)}
              />
              <FieldLabel htmlFor="all-projects" className="font-normal">
                Все объекты организации
              </FieldLabel>
            </Field>
          )}
        />
        {!allProjects ? (
          <Controller
            control={c}
            name="projectIds"
            render={({ field }) =>
              projects.length === 0 ? (
                <FieldDescription>
                  Объектов пока нет — назначить можно будет позже.
                </FieldDescription>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {projects.map((p) => (
                    <Field key={p.id} orientation="horizontal">
                      <Checkbox
                        id={`project-${p.id}`}
                        checked={field.value.includes(p.id)}
                        onCheckedChange={(on) =>
                          field.onChange(
                            on ? [...field.value, p.id] : field.value.filter((id) => id !== p.id),
                          )
                        }
                      />
                      <FieldLabel htmlFor={`project-${p.id}`} className="font-normal">
                        {p.code} — {p.name}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              )
            }
          />
        ) : (
          <FieldDescription>Участник видит все текущие и будущие объекты.</FieldDescription>
        )}
      </FieldSet>
    </>
  );
}
