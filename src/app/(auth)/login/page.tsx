import type { Metadata } from "next";

import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);

  return (
    <AuthCard title="Вход в систему" description="Учётные записи выдаёт администратор организации.">
      {error === "link" ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Ссылка из письма недействительна или устарела. Попросите администратора отправить
          приглашение повторно.
        </p>
      ) : null}
      <LoginForm next={nextPath} />
    </AuthCard>
  );
}
