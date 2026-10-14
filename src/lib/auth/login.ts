import { randomInt } from "node:crypto";

/**
 * Логин сотрудника (Д-87): телефон +992XXXXXXXXX или имя латиницей. Нормализация — как
 * private.normalize_login в БД: телефон → 992XXXXXXXXX, имя → нижний регистр.
 */
const PHONE = /^\+?992[0-9 ()-]{9,16}$/;
const LOGIN = /^(992[0-9]{9}|[a-z][a-z0-9._-]{2,31})$/;

/** Домен технической почты: зона .internal не доставляется — письма не уходят. */
export const TECHNICAL_EMAIL_DOMAIN = "login.buildflow.internal";

export function normalizeLogin(input: string): string {
  const v = input.trim();
  return PHONE.test(v) ? v.replace(/\D/g, "") : v.toLowerCase();
}

export function isValidLogin(input: string): boolean {
  return LOGIN.test(normalizeLogin(input));
}

/** В поле «Логин» можно ввести и email (учётные записи, созданные до Д-87, — например администратор). */
export function isEmailLogin(input: string): boolean {
  return input.includes("@");
}

/** Email учётной записи Supabase Auth для логина: введённый email или техническая почта. */
export function loginToAuthEmail(input: string): string {
  const v = input.trim();
  return isEmailLogin(v) ? v.toLowerCase() : `${normalizeLogin(v)}@${TECHNICAL_EMAIL_DOMAIN}`;
}

/** Для показа: 992901234567 → +992 90 123 45 67; имя — как есть. */
export function formatLogin(login: string): string {
  const m = /^992(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(login);
  return m ? `+992 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : login;
}

/** Без похожих символов (0/O/o, 1/l/I/i): пароль читают с экрана и вводят на телефоне (Д-88). */
export const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Временный пароль: 14 символов криптостойким генератором (≈80 бит). Нигде не сохраняется. */
export function generateTemporaryPassword(length = 14): string {
  let out = "";
  for (let i = 0; i < length; i++)
    out += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  return out;
}
