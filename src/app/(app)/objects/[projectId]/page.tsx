import { Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { allowedItems, itemHref, OBJECT_NAV } from "@/components/layout/nav-items";
import { PageHeader } from "@/components/page-header";
import { SectionTiles } from "@/components/section-tiles";
import { buttonVariants } from "@/components/ui/button";
import { requireObject } from "@/features/projects/object";
import { hasAnyPermission, hasPermission, type OrgAccess } from "@/lib/auth/access-model";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Объект" };

/** Подсказка плитки — по правам: не обещать то, чего у роли нет (склад: накладные без цен). */
function hintFor(path: string, hint: string, org: OrgAccess): string {
  if (path === "/procurement" && !hasPermission(org, "supplier_invoices.manage"))
    return hasPermission(org, "prices.view")
      ? "Журнал накладных, затраты"
      : "Журнал накладных и затраты — без цен";
  if (
    path === "/reports" &&
    !hasAnyPermission(org, [
      "payables.view",
      "cash.view",
      "work_acts.view",
      "work_acts.view_approved",
    ])
  )
    return "Остатки и движение материалов по объекту";
  return hint;
}

/** Главная объекта (Д-94): разделы, доступные по правам, — только по этому объекту. */
export default async function ObjectHomePage({ params }: PageProps<"/objects/[projectId]">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  // Д-113: завскладу объект открывается сразу на «Остатках» (Принять / Выдать / Вернуть).
  if (org.roles.length === 1 && org.roles[0] === "warehouse")
    redirect(objectHref(project.id, "/warehouse"));
  const sections = allowedItems(OBJECT_NAV, org.permissions).filter((i) => i.path !== "");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={project.name}
        description={
          project.status === "ACTIVE"
            ? `Объект ${project.code}`
            : `Объект ${project.code} · в архиве`
        }
        actions={
          hasPermission(org, "projects.manage") ? (
            <Link
              href={`/projects/${project.id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Settings />
              Настройки объекта
            </Link>
          ) : null
        }
      />
      {sections.length === 0 ? (
        <p className="text-muted-foreground">
          По этому объекту у вас нет доступных разделов — обратитесь к администратору.
        </p>
      ) : (
        <SectionTiles
          accentFirst
          tiles={sections.map((i) => ({
            href: itemHref(i, project.id),
            label: i.label,
            hint: hintFor(i.path, i.hint, org),
            icon: i.icon,
          }))}
        />
      )}
    </div>
  );
}
