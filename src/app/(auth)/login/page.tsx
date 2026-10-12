import type { Metadata } from "next";
import { Building } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold">
          <Building className="size-6" aria-hidden />
          BuildFlow
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">Вход в систему</h1>
            </CardTitle>
            <CardDescription>Учётные записи выдаёт администратор организации.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={nextPath} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
