import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { MembersTable } from "@/features/admin/components/members-table";
import { listMembers } from "@/features/admin/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Участники" };

export default async function MembersPage() {
  const org = await requirePermission("members.manage");
  const members = await listMembers(org.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Участники"
        description="Учётные записи, роли и доступ к объектам. Новые участники — только по приглашению."
        actions={
          <Link href="/admin/members/new" className={buttonVariants()}>
            Добавить сотрудника
          </Link>
        }
      />
      <MembersTable members={members} />
    </div>
  );
}
