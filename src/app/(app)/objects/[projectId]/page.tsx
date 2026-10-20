import { Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { allowedItems, itemHref, OBJECT_NAV } from "@/components/layout/nav-items";
import { PageHeader } from "@/components/page-header";
import { SectionTiles } from "@/components/section-tiles";
import { buttonVariants } from "@/components/ui/button";
import { requireObject } from "@/features/projects/object";
import { hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Объект" };

/** Главная объекта (Д-94): разделы, доступные по правам, — только по этому объекту. */
export default async function ObjectHomePage({ params }: PageProps<"/objects/[projectId]">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
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
            hint: i.hint,
            icon: i.icon,
          }))}
        />
      )}
    </div>
  );
}
