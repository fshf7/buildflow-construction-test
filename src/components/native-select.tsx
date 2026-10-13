import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Нативный select в стиле полей shadcn: удобный выбор из длинного списка на телефоне. */
export function NativeSelect({
  className,
  options,
  placeholder,
  ...props
}: ComponentProps<"select"> & {
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm aria-invalid:border-destructive",
        className,
      )}
      {...props}
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
