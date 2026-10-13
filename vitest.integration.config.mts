import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Интеграционные тесты: против запущенного локального Supabase (`npm run db:start`).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
