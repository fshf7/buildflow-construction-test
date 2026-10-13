import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { resolveProject } from "@/features/warehouse/context";
import { listReceiptTargets } from "@/features/warehouse/queries";
import { requirePermission } from "@/lib/auth/access";
import { formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Приёмка" };

// Шаг 1 из 3: что привезли — выбрать «заявка + поставщик».
export default async function ReceivePage({ searchParams }: PageProps<"/warehouse/receive">) {
  const org = await requirePermission("goods_receipts.post");
  const { project: requested } = await searchParams;
  const { project } = await resolveProject(org.id, requested);
  if (!project) return <p className="text-muted-foreground">Нет назначенных объектов.</p>;
  const targets = await listReceiptTargets(project.id);

  return (
    <>
      <PageHeader title="Что привезли?" description={project.label} />
      {targets.length === 0 ? (
        <p className="text-muted-foreground">Заявок в работе по этому объекту нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {targets.map((t) => (
            <li key={`${t.requestId}:${t.supplierId}`}>
              <Link
                href={`/warehouse/receive/${t.requestId}/${t.supplierId}?project=${project.id}`}
                className="flex items-center gap-3 rounded-xl border p-4 hover:bg-muted/50 active:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-base font-semibold">{t.supplierName}</span>
                  <span className="text-xs text-muted-foreground">Заявка {t.requestNumber}</span>
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
        href={`/warehouse/receive/free?project=${project.id}`}
        className={buttonVariants({ variant: "outline" })}
      >
        Приёмка без заявки
      </Link>
    </>
  );
}
