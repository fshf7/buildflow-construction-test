"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Временный пароль (Д-88): показывается один раз — только в памяти страницы, после ухода его не
 * восстановить (сохранён лишь хэш в Supabase Auth). Сотрудник сменит его при первом входе.
 */
export function IssuedPassword({
  title,
  login,
  password,
}: {
  title: string;
  login: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Логин: ${login}\nВременный пароль: ${password}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      role="status"
      aria-label={title}
      className="flex flex-col gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-sm text-muted-foreground">Логин</dt>
        <dd className="font-mono text-lg" data-testid="issued-login">
          {login}
        </dd>
        <dt className="text-sm text-muted-foreground">Временный пароль</dt>
        <dd className="font-mono text-2xl tracking-wider select-all" data-testid="issued-password">
          {password}
        </dd>
      </dl>
      <Button type="button" variant="outline" onClick={copy} className="self-start">
        {copied ? <Check /> : <Copy />}
        {copied ? "Скопировано" : "Скопировать"}
      </Button>
      <p className="text-sm font-medium text-destructive">
        Пароль показывается один раз. Передайте его сотруднику лично; при первом входе он задаст
        свой.
      </p>
    </section>
  );
}
