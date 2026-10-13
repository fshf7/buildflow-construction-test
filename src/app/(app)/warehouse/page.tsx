import { ArrowDownToLine, ArrowUpFromLine, List, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { ProjectPicker } from "@/features/warehouse/components/project-picker";
import { StockList } from "@/features/warehouse/components/stock-list";
import { resolveProject } from "@/features/warehouse/context";
import { listBalances } from "@/features/warehouse/queries";
import { requireOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Склад" };

const big = cn(buttonVariants({ size: "lg" }), "h-20 flex-col gap-1 text-base [&_svg]:size-6");

export default async function WarehousePage({ searchParams }: PageProps<"/warehouse">) {
  const org = await requireOrg();
  // Прораб без доступа к остаткам видит только выдачи своих бригад (Д-26).
  if (!hasPermission(org, "stock.view")) redirect("/warehouse/journal");

  const { project: requested } = await searchParams;
  const { projects, project } = await resolveProject(org.id, requested);
  if (!project) {
    return (
      <p className="text-muted-foreground">
        Вам не назначен ни один объект. Обратитесь к администратору.
      </p>
    );
  }
  const balances = await listBalances(project.id);
  const q = `?project=${project.id}`;
  const canPost =
    hasPermission(org, "goods_receipts.post") || hasPermission(org, "material_issues.post");

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Склад</h1>
        {projects.length > 1 ? (
          <ProjectPicker projects={projects} current={project.id} />
        ) : (
          <p className="text-muted-foreground">{project.label}</p>
        )}
      </div>

      {canPost ? (
        <div className="grid grid-cols-3 gap-2">
          {hasPermission(org, "goods_receipts.post") ? (
            <Link href={`/warehouse/receive${q}`} className={big}>
              <ArrowDownToLine aria-hidden />
              Принять
            </Link>
          ) : null}
          {hasPermission(org, "material_issues.post") ? (
            <>
              <Link href={`/warehouse/issue${q}`} className={big}>
                <ArrowUpFromLine aria-hidden />
                Выдать
              </Link>
              <Link
                href={`/warehouse/return${q}`}
                className={cn(
                  big,
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-20 flex-col",
                )}
              >
                <Undo2 aria-hidden />
                Вернуть
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Остатки</h2>
          <Link
            href={`/warehouse/journal${q}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <List />
            Журнал
          </Link>
        </div>
        <StockList balances={balances} projectId={project.id} />
      </section>
    </>
  );
}
