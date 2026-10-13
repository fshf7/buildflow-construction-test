import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Крупное поле суммы: цифровая клавиатура с запятой, валюта справа. */
export function MoneyInput({
  currency,
  className,
  ...props
}: ComponentProps<"input"> & { currency: string }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="decimal"
        autoComplete="off"
        className={cn("h-12 text-right text-lg tabular-nums", className)}
        {...props}
      />
      <span className="w-10 text-sm text-muted-foreground">{currency}</span>
    </div>
  );
}
