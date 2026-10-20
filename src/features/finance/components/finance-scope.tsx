"use client";

import Link from "next/link";
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";

/** Область финансов для client-компонентов (см. features/finance/scope.ts, Д-94). */
type ClientFinanceScope = { projectId: string | null; base: string };

const FinanceScopeContext = createContext<ClientFinanceScope | null>(null);

export function FinanceScopeProvider({
  scope,
  children,
}: {
  scope: ClientFinanceScope;
  children: ReactNode;
}) {
  return <FinanceScopeContext.Provider value={scope}>{children}</FinanceScopeContext.Provider>;
}

export function useFinanceScope(): ClientFinanceScope {
  const value = useContext(FinanceScopeContext);
  if (!value) throw new Error("useFinanceScope: компонент вне раздела финансов");
  return value;
}

/** Ссылка внутри раздела финансов: path — от базового адреса (/finance или /objects/<id>/finance). */
export function FinanceLink({
  path,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { path: string }) {
  const { base } = useFinanceScope();
  return <Link href={`${base}${path}`} {...props} />;
}
