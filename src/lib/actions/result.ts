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

const qty = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });
const q = (v: unknown, unit?: unknown) =>
  `${qty.format(Number(v))}${unit ? ` ${String(unit)}` : ""}`;
const moneyFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money = (v: unknown, currency?: unknown) =>
  `${moneyFmt.format(Number(v))}${currency ? ` ${String(currency)}` : ""}`;

/** Ошибки с подробностями в detail (JSON из БД) — сообщение с цифрами (Д-19). */
function detailedMessage(message: string, details: string | null | undefined): string | null {
  if (!details) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (message === "BF_NEGATIVE_STOCK") {
    return `Недостаточно на складе: ${String(d.material)} — есть ${q(d.available, d.unit)}, нужно ${q(d.required, d.unit)}`;
  }
  if (message === "BF_NEGATIVE_CASH") {
    return `Недостаточно денег: «${String(d.account)}» — на счёте ${money(d.balance, d.currency)}, нужно ${money(d.required, d.currency)}`;
  }
  if (message === "BF_OVERPAYMENT") {
    return `Сумма больше долга: осталось оплатить ${money(d.remaining, d.currency)}, указано ${money(d.requested, d.currency)}`;
  }
  if (message === "BF_ALLOCATION_MISMATCH" && d.amount !== undefined) {
    return `Сумма распределения (${money(d.allocated)}) не равна сумме операции (${money(d.amount)})`;
  }
  if (message === "BF_RETURN_EXCEEDS_ISSUED") {
    return `Нельзя вернуть больше выданного: ${String(d.material)} — выдано ${q(d.issued, d.unit)}, уже возвращено ${q(d.returned, d.unit)}, к возврату ${q(d.requested, d.unit)}`;
  }
  return null;
}

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
  BF_NOT_FOUND: "Документ не найден или недоступен",
  BF_INVALID_STATUS: "Документ уже в другом статусе — обновите страницу",
  BF_DOCUMENT_LOCKED: "Документ уже нельзя изменить",
  BF_NO_LINES: "Добавьте хотя бы одну строку",
  BF_LINE_INCOMPLETE: "У каждой строки должны быть поставщик и цена",
  BF_HAS_RECEIPTS: "По заявке уже есть приёмки — отмена невозможна",
  BF_HAS_DRAFT_RECEIPTS:
    "Сначала проведите или удалите черновики приёмок и корректировки на согласовании",
  BF_OPEN_INVOICES: "Есть неподтверждённые накладные по заявке",
  BF_ZERO_AMOUNT: "Сумма накладной должна быть больше нуля",
  BF_HAS_PAYMENTS: "По документу есть оплаты — отмена невозможна (сначала сторно оплат)",
  BF_REQUEST_NOT_OPEN: "Заявка не в работе — приёмка по ней невозможна",
  BF_LINE_MISMATCH: "Строки не соответствуют заявке или поставщику",
  BF_CORRECTION_NEEDS_APPROVAL: "Заявка уже на сверке — корректировку нужно отправить бухгалтеру",
  BF_CORRECTION_NO_APPROVAL_NEEDED: "Согласование не требуется — проведите корректировку",
  BF_CORRECTION_EXISTS: "По этой приёмке уже есть корректировка",
  BF_CREW_INACTIVE: "Бригада в архиве",
  BF_HAS_RETURNS: "Сначала сторнируйте возвраты по этой выдаче",
  BF_ISSUE_NOT_POSTED: "Выдача не проведена или сторнирована",
  BF_IDEMPOTENCY_KEY_REUSED: "Повторный запрос не совпадает с исходным — обновите страницу",
  BF_UNIT_LOCKED: "По материалу уже есть движения — единицу измерения менять нельзя",
  BF_NO_WAREHOUSE: "У объекта нет склада",
  BF_NEGATIVE_STOCK: "Недостаточно материала на складе",
  BF_RETURN_EXCEEDS_ISSUED: "Нельзя вернуть больше выданного",
  BF_NEGATIVE_CASH: "Недостаточно денег в кассе",
  BF_OVERPAYMENT: "Сумма больше остатка долга",
  BF_ALLOCATION_MISMATCH:
    "Оплата не соответствует основанию: проверьте поставщика, обязательства и суммы",
  BF_NO_DESCRIPTION: "Укажите наименование",
  BF_ROW_TOO_OLD: "Строка старше 7 дней — исправить может материальный бухгалтер",
  BF_REQUIRED_FIELDS: "Заполните дату и категорию",
  BF_ALLOCATION_PROJECT: "Долг или счёт другого объекта — оплатите его внутри своего объекта",
  BF_CURRENCY_MISMATCH: "Валюта кассы и долга различаются — конвертации нет",
  BF_REQUEST_NOT_APPROVED: "Счёт на оплату не согласован или назначение не совпадает",
  BF_SELF_APPROVAL: "Согласовать собственный документ нельзя",
  BF_ACCOUNT_INACTIVE: "Касса в архиве или недоступна",
  BF_ACCOUNT_HAS_OPERATIONS: "По кассе уже есть операции — валюту менять нельзя",
  BF_REVERSAL_PENDING: "Сторно уже запрошено и ждёт решения бухгалтера",
  BF_NO_REVERSAL_REQUEST: "Запроса на сторно нет — обновите страницу",
  BF_NO_RATE:
    "Для этого вида работ у бригады нет действующего тарифа — его устанавливает управляющий",
  BF_RATE_EXISTS: "Тариф с этой даты уже есть — исправьте его или выберите другую дату",
  BF_RATE_IN_USE: "Тариф уже использован в акте — изменить нельзя, добавьте новый с другой даты",
  BF_EMPTY_DOCUMENT: "Добавьте хотя бы одну строку",
  BF_INVALID_TRANSITION: "Такой переход статуса невозможен — обновите страницу",
  BF_INVALID_ASSIGNEE:
    "Исполнитель должен быть складом, кассиром или прорабом с доступом к объекту",
  BF_DIRECT_STATUS_CHANGE: "Статус меняется только через действия документа",
  BF_LOGIN_TAKEN: "Такой логин уже занят — выберите другой",
  BF_LOGIN_INVALID: "Логин — телефон в формате +992XXXXXXXXX или имя латиницей (3–32 символа)",
  BF_USER_HAS_LOGIN: "У этой учётной записи уже есть логин",
  BF_SELF_PASSWORD_RESET:
    "Свой пароль сбрасывает другой администратор или серверный скрипт npm run password:reset",
};

export function dbErrorMessage(error: PgLikeError): string {
  if (!error) return "Неизвестная ошибка";
  const detailed = error.message ? detailedMessage(error.message, error.details) : null;
  if (detailed) return detailed;
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
