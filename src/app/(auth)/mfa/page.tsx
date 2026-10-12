import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { AuthCard } from "@/features/auth/components/auth-card";
import { MfaForm } from "@/features/auth/components/mfa-form";
import { safeNextPath } from "@/lib/auth/redirect";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Подтверждение входа" };

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  await requireUser();
  const { next } = await searchParams;
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);

  const supabase = await createClient();
  // Уровень входа — из проверенного JWT (getClaims), а не из непроверенной сессии в cookie.
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims.aal === "aal2") redirect(nextPath);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");

  return (
    <AuthCard
      title={verified ? "Подтвердите вход" : "Подключите второй фактор"}
      description={
        verified
          ? "Введите код из приложения-аутентификатора."
          : "Для вашей роли вход защищён вторым фактором — это обязательное требование."
      }
    >
      <MfaForm mode={verified ? "verify" : "enroll"} factorId={verified?.id} next={nextPath} />
      <form action={signOut} className="mt-4">
        <Button type="submit" variant="ghost" className="w-full">
          Выйти
        </Button>
      </form>
    </AuthCard>
  );
}
