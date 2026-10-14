import type { Metadata } from "next";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SetPasswordForm } from "@/features/auth/components/set-password-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Пароль" };

export default async function SetPasswordPage() {
  await requireUser();
  return (
    <AuthCard
      title="Задайте новый пароль"
      description="Временный пароль от администратора действует только для первого входа. Придумайте свой — не короче 10 символов."
    >
      <SetPasswordForm />
    </AuthCard>
  );
}
