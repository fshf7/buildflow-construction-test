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
  // Д-94: объектные разделы переехали под /objects/<id>/… — старые закладки ведут на выбор объекта.
  async redirects() {
    return ["/procurement", "/warehouse", "/tasks", "/crews/acts"].flatMap((source) => [
      { source, destination: "/", permanent: false },
      { source: `${source}/:path*`, destination: "/", permanent: false },
    ]);
  },
  experimental: {
    // Сканы накладных и фото приёмки (до 10 МБ) загружаются через server action.
    serverActions: { bodySizeLimit: "11mb" },
  },
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
