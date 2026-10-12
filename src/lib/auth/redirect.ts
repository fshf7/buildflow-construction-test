/**
 * Безопасный путь возврата после входа: только относительный путь этого же сайта.
 * Защищает от open redirect через ?next=https://evil.example или //evil.example.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next === "/login" || next.startsWith("/login/")) return "/";
  return next;
}
