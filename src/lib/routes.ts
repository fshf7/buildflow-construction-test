/**
 * Адреса работы «внутри объекта» (Д-94): всё объектное — под /objects/<id>/…,
 * общее по организации — по своим адресам (/finance, /reports, /crews, /catalog, …).
 * Без server-only: нужен и серверу, и клиенту.
 */
export const OBJECT_ROOT = "/objects";

export function objectHref(projectId: string, path = ""): string {
  return `${OBJECT_ROOT}/${projectId}${path}`;
}

/** id объекта из адреса /objects/<id>/… — null вне объекта. */
export function objectIdFromPath(pathname: string): string | null {
  const m = /^\/objects\/([^/?#]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}
