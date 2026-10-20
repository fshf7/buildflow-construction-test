import type { ReactNode } from "react";

import { env } from "@/env";
import { initials } from "@/lib/format";

import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { OrgSwitcher } from "./org-switcher";
import { SignOutButton } from "./sign-out-button";

const ENV_LABEL = { local: "локально", staging: "staging", production: null } as const;

type Org = { id: string; name: string };

export function AppShell({
  displayName,
  currentOrg,
  organizations,
  allowedHrefs,
  children,
}: {
  displayName: string;
  currentOrg: Org;
  organizations: Org[];
  allowedHrefs: string[];
  children: ReactNode;
}) {
  const envLabel = ENV_LABEL[env.NEXT_PUBLIC_APP_ENV];

  return (
    // Светло-серая подложка, приложение — в белой «раме» (на телефоне — во весь экран).
    <div className="flex min-h-dvh flex-1 md:p-3 xl:p-5 print:p-0">
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 bg-background md:gap-2 md:rounded-[2rem] md:p-2 md:shadow-xl md:ring-1 md:shadow-panel/5 md:ring-border print:rounded-none print:p-0 print:shadow-none print:ring-0">
        {/* Тёмная панель меню — планшет и десктоп */}
        <aside className="sticky top-5 hidden max-h-[calc(100dvh-2.5rem)] w-64 shrink-0 flex-col gap-6 self-start rounded-[1.5rem] bg-panel p-4 text-panel-foreground md:flex print:hidden">
          <Brand tone="dark" className="px-2 pt-1" />
          <div className="-mx-1 flex-1 [scrollbar-width:thin] overflow-y-auto px-1">
            <NavLinks allowedHrefs={allowedHrefs} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:static md:h-[4.5rem] md:border-none md:bg-transparent md:px-6 md:backdrop-blur-none print:hidden">
            <MobileNav allowedHrefs={allowedHrefs} />
            <div className="flex min-w-0 items-center gap-2">
              <OrgSwitcher current={currentOrg} organizations={organizations} />
              {envLabel ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                  {envLabel}
                </span>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-2.5 rounded-full sm:border sm:py-1 sm:pr-4 sm:pl-1">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary to-chart-2 text-sm font-semibold text-primary-foreground"
                >
                  {initials(displayName)}
                </span>
                <span className="hidden max-w-48 truncate text-sm font-medium sm:inline">
                  {displayName}
                </span>
              </div>
              <SignOutButton />
            </div>
          </header>

          <main className="flex-1 px-4 pt-5 pb-8 md:px-6 md:pt-1 print:p-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
