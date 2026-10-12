import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/env";
import { getServerEnv } from "@/lib/env/server";

import type { Database } from "./database.types";

/**
 * Клиент с секретным ключом: обходит RLS. Только для операций Auth Admin API (приглашения)
 * и только ПОСЛЕ проверки прав текущего пользователя. Бизнес-данные через него не пишем —
 * для них есть RPC, которые проверяют права сами.
 */
export function createAdminClient() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
