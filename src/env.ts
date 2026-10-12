import { parsePublicEnv } from "./lib/env/schema";

export type { PublicEnv, ServerEnv } from "./lib/env/schema";

// Обращения к process.env.NEXT_PUBLIC_* должны быть буквальными — только так Next.js вшивает их в бандл.
export const env = parsePublicEnv({
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
