"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useObjectHref } from "./object-context";

/** Ссылка внутри текущего объекта: path — от /objects/<id> (для таблиц и client-компонентов, Д-94). */
export function ObjectLink({
  path,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { path: string }) {
  const href = useObjectHref();
  return <Link href={href(path)} {...props} />;
}
