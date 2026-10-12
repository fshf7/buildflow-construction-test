import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { EditMemberForm } from "@/features/admin/components/edit-member-form";
import { getMember, listProjectOptions } from "@/features/admin/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Участник" };

export default async function MemberPage({ params }: PageProps<"/admin/members/[id]">) {
  const org = await requirePermission("members.manage");
  const { id } = await params;
  const [member, projects] = await Promise.all([getMember(org.id, id), listProjectOptions(org.id)]);
  if (!member) notFound();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title={member.fullName} description="Роли, объекты и доступ участника." />
      <EditMemberForm member={member} projects={projects} />
    </div>
  );
}
