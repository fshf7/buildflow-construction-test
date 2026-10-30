import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PagedPager, PageSlice } from "@/components/pagination";
import { listOpenings } from "@/features/opening/queries";
import { OPENING_KIND_LABELS, type OpeningKind } from "@/features/opening/schemas";
import { requirePermission } from "@/lib/auth/access";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Ввод остатков" };

const STATUS = { DRAFT: "Черновик", POSTED: "Проведён", REVERSED: "Сторнирован" } as const;

// Д-61: начальные остатки — документом (аудит, сторно). Метод оценки и инвентаризация — TODO(TZ-open).
export default async function OpeningPage() {
  const org = await requirePermission("opening_balances.manage");
  const rows = await listOpenings(org.id);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Ввод остатков"
        description="Начальные остатки склада, касс и долгов на дату начала учёта в BuildFlow."
        actions={
          <>
            {(["STOCK", "CASH", "PAYABLES"] as OpeningKind[]).map((k) => (
              <Link
                key={k}
                href={`/opening/new?kind=${k}`}
                className={buttonVariants({ variant: "outline" })}
              >
                {OPENING_KIND_LABELS[k]}
              </Link>
            ))}
          </>
        }
      />
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Документов пока нет.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-lg border">
            <PageSlice>
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/opening/${r.id}`}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {r.number ?? "Черновик"} · {OPENING_KIND_LABELS[r.kind]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        на {formatDate(r.docDate)}
                        {r.projectLabel ? ` · ${r.projectLabel}` : ""}
                      </span>
                    </span>
                    <Badge variant="outline">{STATUS[r.status]}</Badge>
                  </Link>
                </li>
              ))}
            </PageSlice>
          </ul>
          <PagedPager total={rows.length} />
        </>
      )}
    </div>
  );
}
