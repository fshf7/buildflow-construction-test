import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { allowedItems, COMMON_NAV } from "@/components/layout/nav-items";
import { PageHeader } from "@/components/page-header";
import { SectionTiles } from "@/components/section-tiles";
import { listProjects } from "@/features/projects/queries";
import { requireOrg } from "@/lib/auth/access";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Выбор объекта" };

/**
 * Д-94: главный экран — выбор объекта (ЖК), внутри которого человек работает только по нему,
 * и «Общее по организации». Объекты — только доступные пользователю (RLS, project_members).
 */
export default async function HomePage() {
  const org = await requireOrg();
  const projects = await listProjects(org.id);
  const active = projects.filter((p) => p.status === "ACTIVE");
  const archived = projects.filter((p) => p.status !== "ACTIVE");
  const common = allowedItems(COMMON_NAV, org.permissions);

  // Один объект и нечего выбирать в «Общем» (склад, прораб) — сразу в объект.
  if (active.length === 1 && archived.length === 0 && common.length === 0) {
    redirect(objectHref(active[0]!.id));
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        title="Выберите объект"
        description={
          org.full_name ? `Здравствуйте, ${org.full_name}` : "Работа ведётся внутри объекта"
        }
      />

      {active.length === 0 ? (
        <p className="text-muted-foreground">
          Вам не назначен ни один объект. Обратитесь к администратору.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((p) => (
            <li key={p.id}>
              <Link
                href={objectHref(p.id)}
                className="group flex min-h-32 flex-col justify-between gap-4 rounded-3xl bg-linear-to-br from-primary to-chart-4 p-5 text-primary-foreground shadow-lg shadow-primary/30 transition-shadow hover:shadow-xl"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/15">
                    <Building2 className="size-5" aria-hidden />
                  </span>
                  <span className="rounded-full bg-primary-foreground/15 px-2.5 py-0.5 text-xs font-medium">
                    {p.code}
                  </span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-xl font-semibold tracking-tight">{p.name}</span>
                  {p.address ? (
                    <span className="text-sm text-primary-foreground/80">{p.address}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Архивные объекты</h2>
          <ul className="flex flex-wrap gap-2">
            {archived.map((p) => (
              <li key={p.id}>
                <Link
                  href={objectHref(p.id)}
                  className="inline-flex h-9 items-center rounded-full border px-4 text-sm hover:bg-muted"
                >
                  {p.code} — {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {common.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Общее по организации</h2>
          <SectionTiles
            tiles={common.map((i) => ({
              href: i.path,
              label: i.label,
              hint: i.hint,
              icon: i.icon,
            }))}
          />
        </section>
      ) : null}
    </div>
  );
}
