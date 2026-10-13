import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Крупное поле количества для телефона: цифровая клавиатура с запятой, единица справа. */
export function QtyInput({
  unit,
  className,
  ...props
}: ComponentProps<"input"> & { unit: string }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="decimal"
        autoComplete="off"
        className={cn("h-12 w-28 text-right text-lg tabular-nums", className)}
        {...props}
      />
      <span className="w-10 text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}
