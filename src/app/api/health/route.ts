import { env } from "@/env";
import { clientIpFrom, rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@supabase/supabase-js";

// Health-check (Д-84): приложение отвечает и БД доступна. Без секретов и данных; без авторизации.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const noStore = { "Cache-Control": "no-store" };
  const limit = await rateLimit([{ name: "health_ip", value: clientIpFrom(request.headers) }]);
  if (!limit.ok)
    return Response.json({ status: "rate_limited" }, { status: 429, headers: noStore });

  const started = Date.now();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const { data, error } = await supabase.rpc("health");
  const dbOk = !error && data === 1;
  return Response.json(
    {
      status: dbOk ? "ok" : "degraded",
      env: env.NEXT_PUBLIC_APP_ENV,
      version:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
        process.env.NEXT_PUBLIC_BUILD_SHA ??
        "local",
      db: dbOk ? "ok" : "fail",
      latencyMs: Date.now() - started,
    },
    { status: dbOk ? 200 : 503, headers: noStore },
  );
}
