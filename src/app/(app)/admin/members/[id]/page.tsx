import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Separator } from "@/components/ui/separator";
import { EditMemberForm } from "@/features/admin/components/edit-member-form";
import { MfaReset } from "@/features/admin/components/mfa-reset";
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
      <section className="flex max-w-2xl flex-col gap-3">
        <h2 className="text-lg font-semibold">Безопасность</h2>
        <MfaReset
          memberId={member.id}
          memberName={member.fullName}
          hasMfa={member.hasMfa}
          isSelf={member.id === org.member_id}
        />
      </section>
      <Separator />
      <EditMemberForm member={member} projects={projects} />
    </div>
  );
}
