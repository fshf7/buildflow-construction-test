import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { AccountsSection } from "@/features/finance/components/accounts-section";
import { listAccounts } from "@/features/finance/queries";
import { listProjectOptions } from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Кассы и счета" };

export default async function AccountsPage() {
  const org = await requirePermission("cash_accounts.manage");
  const [accounts, projects] = await Promise.all([
    listAccounts(org.id),
    listProjectOptions(org.id),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader
        title="Кассы и банковские счета"
        description="Уход в минус запрещён. Валюту кассы с операциями менять нельзя."
      />
      <AccountsSection accounts={accounts} projects={projects} />
    </div>
  );
}
