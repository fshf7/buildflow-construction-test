/**
 * Content-Disposition для выгрузки: в заголовке HTTP допустим только ASCII, а коды объектов и
 * названия бывают кириллицей («Т1»). Имя — ASCII-запасное плюс filename* в UTF-8 (RFC 6266).
 */
export function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
