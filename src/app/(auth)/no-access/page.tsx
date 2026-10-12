import type { Metadata } from "next";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { AuthCard } from "@/features/auth/components/auth-card";

export const metadata: Metadata = { title: "Нет доступа" };

export default async function NoAccessPage({ searchParams }: PageProps<"/no-access">) {
  const { reason } = await searchParams;
  const forbidden = reason === "forbidden";

  return (
    <AuthCard
      title="Нет доступа"
      description={
        forbidden
          ? "Для этого раздела у вашей роли нет прав. Если они нужны — обратитесь к администратору организации."
          : "Ваша учётная запись не состоит ни в одной организации или отключена. Обратитесь к администратору."
      }
    >
      <div className="flex flex-col gap-2">
        {forbidden ? (
          <Link href="/" className={buttonVariants({ size: "lg" })}>
            На главную
          </Link>
        ) : null}
        <form action={signOut}>
          <Button type="submit" variant="outline" size="lg" className="w-full">
            Выйти
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
