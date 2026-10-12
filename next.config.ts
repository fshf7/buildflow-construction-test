import path from "node:path";

import type { NextConfig } from "next";

// Валидация публичных env на этапе сборки: NEXT_PUBLIC_* вшиваются в бандл при `next build`,
// поэтому их отсутствие должно ронять сборку, а не всплывать в браузере.
import "./src/env";

const nextConfig: NextConfig = {
  // Д-35: все экраны ERP персональные и отфильтрованы RLS — серверный кэш компонентов
  // между пользователями здесь только риск. Включать осознанно, отдельным решением.
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    // Корень — каталог проекта (в домашнем каталоге есть посторонний package-lock.json).
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
