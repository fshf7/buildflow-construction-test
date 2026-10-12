import { Building, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { signOut } from "@/features/auth/actions";
import type { CurrentUser } from "@/lib/auth/session";

import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

const ENV_LABEL = { local: "локально", staging: "staging", production: null } as const;

export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const envLabel = ENV_LABEL[env.NEXT_PUBLIC_APP_ENV];
  const displayName = user.fullName ?? user.email ?? "Пользователь";

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Боковое меню — планшет и десктоп */}
      <aside className="hidden w-64 shrink-0 border-r bg-muted/30 md:flex md:flex-col">
        <Link href="/" className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
          <Building className="size-5" aria-hidden />
          BuildFlow
        </Link>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-2 backdrop-blur md:px-6">
          <MobileNav />
          <Link href="/" className="flex items-center gap-2 font-semibold md:hidden">
            <Building className="size-5" aria-hidden />
            BuildFlow
          </Link>
          {envLabel ? (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              {envLabel}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
              {displayName}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="icon-lg" aria-label="Выйти">
                <LogOut className="size-5" />
              </Button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
