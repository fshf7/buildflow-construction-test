import type { Metadata } from "next";

import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Восстановление пароля" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Восстановление пароля"
      description="Укажите email учётной записи — пришлём ссылку для смены пароля."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
