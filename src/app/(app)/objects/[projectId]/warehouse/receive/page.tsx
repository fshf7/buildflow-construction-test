import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireObject } from "@/features/projects/object";
import { listReceiptTargets } from "@/features/warehouse/queries";
import { formatQuantity } from "@/lib/format";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Приёмка" };

// Шаг 1 из 3: что привезли — выбрать заявку (поставщика склад укажет на следующем шаге, Д-92).
export default async function ReceivePage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/receive">) {
  const { projectId } = await params;
  const { project } = await requireObject(projectId, "goods_receipts.post");
  const targets = await listReceiptTargets(project.id);

  return (
    <>
      <PageHeader title="Что привезли?" description={project.label} />
      {targets.length === 0 ? (
        <p className="text-muted-foreground">Заявок в работе по этому объекту нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {targets.map((t) => (
            <li key={t.requestId}>
              <Link
                href={objectHref(project.id, `/warehouse/receive/${t.requestId}`)}
                className="flex items-center gap-3 rounded-xl border p-4 hover:bg-muted/50 active:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-base font-semibold">Заявка {t.requestNumber}</span>
                  <span className="text-sm">
                    {t.lines.length === 0
                      ? "Всё по заявке уже принято"
                      : t.lines
                          .map((l) => `${l.name} ${formatQuantity(l.remaining, l.unit)}`)
                          .join(" · ")}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={objectHref(project.id, "/warehouse/receive/free")}
        className={buttonVariants({ variant: "outline" })}
      >
        Приёмка без заявки
      </Link>
    </>
  );
}
