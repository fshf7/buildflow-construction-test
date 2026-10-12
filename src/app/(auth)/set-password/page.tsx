import type { Metadata } from "next";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SetPasswordForm } from "@/features/auth/components/set-password-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Пароль" };

export default async function SetPasswordPage() {
  const user = await requireUser();
  return (
    <AuthCard
      title="Задайте пароль"
      description={`Учётная запись ${user.email ?? ""}. Пароль понадобится для следующих входов.`}
    >
      <SetPasswordForm />
    </AuthCard>
  );
}
