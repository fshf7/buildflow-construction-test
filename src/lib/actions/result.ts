/** Единый формат ответа server actions: форма показывает error, поля — fieldErrors. */
export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<void>;
export function ok<T>(data?: T): ActionResult<T | void> {
  return { ok: true, data };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string>,
): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return { ok: false, error, fieldErrors };
}

type PgLikeError = { code?: string; message?: string; details?: string | null } | null | undefined;

/** Коды BF_* из Postgres-функций → сообщения на русском. */
const BF_MESSAGES: Record<string, string> = {
  BF_FORBIDDEN: "Недостаточно прав для этого действия",
  BF_LAST_ADMIN: "В организации должен остаться хотя бы один активный администратор",
  BF_ROLE_REQUIRED: "Выберите хотя бы одну роль",
  BF_UNKNOWN_ROLE: "Неизвестная роль",
  BF_ALREADY_MEMBER: "Этот пользователь уже состоит в организации",
  BF_MFA_REQUIRED: "Действие доступно только после входа со вторым фактором",
  BF_SELF_MFA_RESET:
    "Свой второй фактор сбросить нельзя — обратитесь к другому администратору или используйте npm run mfa:reset",
  BF_REASON_REQUIRED: "Укажите причину (не короче 3 символов)",
};

export function dbErrorMessage(error: PgLikeError): string {
  if (!error) return "Неизвестная ошибка";
  if (error.message && BF_MESSAGES[error.message]) return BF_MESSAGES[error.message];
  switch (error.code) {
    case "42501":
      return "Недостаточно прав для этого действия";
    case "23505":
      return "Запись с такими данными уже существует";
    case "23503":
      return "Связанная запись не найдена или недоступна";
    case "23514":
      return "Данные не прошли проверку";
    default:
      return "Не удалось сохранить. Попробуйте ещё раз";
  }
}
