import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/env";

import type { Database } from "./database.types";

/** Клиент Supabase для Client Components. Работает с правами вошедшего пользователя (RLS). */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
