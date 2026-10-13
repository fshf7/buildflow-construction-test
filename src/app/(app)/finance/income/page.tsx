import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { IncomeForm } from "@/features/finance/components/income-form";
import { listAccounts } from "@/features/finance/queries";
import { listProjectOptions } from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Приход" };

export default async function IncomePage() {
  const org = await requirePermission("cash.post");
  const [accounts, projects] = await Promise.all([
    listAccounts(org.id, true),
    listProjectOptions(org.id),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader title="Приход" />
      <IncomeForm accounts={accounts} projects={projects} />
    </div>
  );
}
