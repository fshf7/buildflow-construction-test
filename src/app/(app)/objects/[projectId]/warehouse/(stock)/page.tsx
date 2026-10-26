import { ArrowDownToLine, ArrowUpFromLine, Undo2 } from "lucide-react";
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

export const metadata: Metadata = { title: "Остатки склада" };

// Крупные кнопки для телефона. Вариант задаётся у каждой отдельно: смешивать default и outline
// нельзя — от default остаётся белый текст на белом фоне outline.
const big = "h-20 flex-col gap-1 text-base [&_svg]:size-6";
const primary = cn(buttonVariants({ size: "lg" }), big);

export default async function WarehousePage({
  params,
}: PageProps<"/objects/[projectId]/warehouse">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  const href = (path: string) => objectHref(project.id, path);
  // Без доступа к остаткам: прораб — расход своих бригад (Д-26), остальные — заявки склада.
  if (!hasPermission(org, "stock.view"))
    redirect(
      href(
        hasPermission(org, "stock.view_own_crews") ? "/warehouse/outgoing" : "/warehouse/requests",
      ),
    );

  const balances = await listBalances(project.id);
  const canPost =
    hasPermission(org, "goods_receipts.post") || hasPermission(org, "material_issues.post");

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Остатки склада</h1>
        <p className="text-muted-foreground">{project.label}</p>
      </div>

      {canPost ? (
        <div className="grid grid-cols-3 gap-2">
          {hasPermission(org, "goods_receipts.post") ? (
            <Link href={href("/warehouse/receive")} className={primary}>
              <ArrowDownToLine aria-hidden />
              Принять
            </Link>
          ) : null}
          {hasPermission(org, "material_issues.post") ? (
            <>
              <Link href={href("/warehouse/issue")} className={primary}>
                <ArrowUpFromLine aria-hidden />
                Выдать
              </Link>
              <Link
                href={href("/warehouse/return")}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), big)}
              >
                <Undo2 aria-hidden />
                Вернуть
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Остатки</h2>
        <StockList balances={balances} />
      </section>
    </>
  );
}
