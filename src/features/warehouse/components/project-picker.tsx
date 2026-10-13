"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { NativeSelect } from "@/components/native-select";

/** Выбор объекта (склада), если их несколько. Запоминается в URL. */
export function ProjectPicker({
  projects,
  current,
}: {
  projects: { id: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (projects.length < 2) return null;
  return (
    <NativeSelect
      aria-label="Объект"
      className="h-11 text-base"
      value={current}
      options={projects.map((p) => ({ value: p.id, label: p.label }))}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        next.set("project", e.target.value);
        router.replace(`${pathname}?${next.toString()}`);
      }}
    />
  );
}
