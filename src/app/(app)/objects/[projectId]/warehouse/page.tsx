import { ArrowDownToLine, ArrowUpFromLine, List, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { requireObject } from "@/features/projects/object";
import { StockList } from "@/features/warehouse/components/stock-list";
import { listBalances } from "@/features/warehouse/queries";
import { hasPermission } from "@/lib/auth/access-model";
import { objectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Склад" };

const big = cn(buttonVariants({ size: "lg" }), "h-20 flex-col gap-1 text-base [&_svg]:size-6");

export default async function WarehousePage({
  params,
}: PageProps<"/objects/[projectId]/warehouse">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  const href = (path: string) => objectHref(project.id, path);
  // Прораб без доступа к остаткам видит только выдачи своих бригад (Д-26).
  if (!hasPermission(org, "stock.view")) redirect(href("/warehouse/journal"));

  const balances = await listBalances(project.id);
  const canPost =
    hasPermission(org, "goods_receipts.post") || hasPermission(org, "material_issues.post");

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Склад</h1>
        <p className="text-muted-foreground">{project.label}</p>
      </div>

      {canPost ? (
        <div className="grid grid-cols-3 gap-2">
          {hasPermission(org, "goods_receipts.post") ? (
            <Link href={href("/warehouse/receive")} className={big}>
              <ArrowDownToLine aria-hidden />
              Принять
            </Link>
          ) : null}
          {hasPermission(org, "material_issues.post") ? (
            <>
              <Link href={href("/warehouse/issue")} className={big}>
                <ArrowUpFromLine aria-hidden />
                Выдать
              </Link>
              <Link
                href={href("/warehouse/return")}
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
            href={href("/warehouse/journal")}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <List />
            Журнал
          </Link>
        </div>
        <StockList balances={balances} />
      </section>
    </>
  );
}
