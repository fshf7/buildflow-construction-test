// Выполняется один раз при старте сервера Next.js: env проверяется до первого запроса.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { parseServerEnv } = await import("./lib/env/schema");
    parseServerEnv(process.env);
  }
}
