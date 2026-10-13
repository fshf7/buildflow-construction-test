import type { Metadata } from "next";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SetPasswordForm } from "@/features/auth/components/set-password-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Новый пароль" };

// Сюда ведёт ссылка из письма восстановления (/auth/confirm ставит сессию).
// Второй фактор новый пароль не отменяет: роли с MFA после сохранения идут на /mfa.
export default async function ResetPasswordPage() {
  const user = await requireUser();
  return (
    <AuthCard title="Новый пароль" description={`Учётная запись ${user.email ?? ""}.`}>
      <SetPasswordForm />
    </AuthCard>
  );
}
