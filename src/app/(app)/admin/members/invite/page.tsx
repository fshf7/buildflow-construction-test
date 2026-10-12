import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { InviteMemberForm } from "@/features/admin/components/invite-member-form";
import { listProjectOptions } from "@/features/admin/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Приглашение участника" };

export default async function InviteMemberPage() {
  const org = await requirePermission("members.manage");
  const projects = await listProjectOptions(org.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Приглашение участника"
        description="Человек получит письмо со ссылкой, задаст пароль и (для бухгалтера, кассира и администратора) подключит второй фактор."
      />
      <InviteMemberForm projects={projects} />
    </div>
  );
}
