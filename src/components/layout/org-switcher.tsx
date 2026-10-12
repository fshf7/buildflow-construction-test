"use client";

import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { switchOrganization } from "@/features/auth/actions";

type Org = { id: string; name: string };

/** Название текущей организации; если их несколько — выбор. */
export function OrgSwitcher({ current, organizations }: { current: Org; organizations: Org[] }) {
  const [isPending, startTransition] = useTransition();

  if (organizations.length < 2) {
    return <span className="truncate text-sm font-medium">{current.name}</span>;
  }

  return (
    <Select
      value={current.id}
      disabled={isPending}
      onValueChange={(id) => startTransition(() => switchOrganization(id))}
    >
      <SelectTrigger size="sm" className="max-w-56" aria-label="Организация">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {organizations.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
