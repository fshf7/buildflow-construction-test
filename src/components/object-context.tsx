"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

import { objectHref } from "@/lib/routes";

type ObjectInfo = { id: string; label: string };

const ObjectContext = createContext<ObjectInfo | null>(null);

/** Текущий объект для client-компонентов внутри /objects/<id> (ставит layout объекта, Д-94). */
export function ObjectProvider({
  project,
  children,
}: {
  project: ObjectInfo;
  children: ReactNode;
}) {
  return <ObjectContext.Provider value={project}>{children}</ObjectContext.Provider>;
}

export function useObject(): ObjectInfo {
  const value = useContext(ObjectContext);
  if (!value) throw new Error("useObject: компонент вне объекта (нет ObjectProvider)");
  return value;
}

/** Адрес внутри текущего объекта: href("/procurement/requests") → /objects/<id>/procurement/requests. */
export function useObjectHref(): (path?: string) => string {
  const { id } = useObject();
  return useCallback((path = "") => objectHref(id, path), [id]);
}
