import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { AddMemberForm } from "@/features/admin/components/add-member-form";
import { listProjectOptions } from "@/features/admin/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Новый сотрудник" };

export default async function NewMemberPage() {
  const org = await requirePermission("members.manage");
  const projects = await listProjectOptions(org.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Новый сотрудник"
        description="Система выдаст временный пароль — покажем один раз. При первом входе сотрудник задаст свой пароль, а администратор и кассир — ещё и подключат второй фактор."
      />
      <AddMemberForm projects={projects} />
    </div>
  );
}
