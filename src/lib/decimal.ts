import { z } from "zod";

/** Десятичное число из поля формы: «12,5» и «12.5»; до 4 знаков после запятой (numeric(18,4)). */
export function decimalString(
  opts: { allowZero?: boolean; maxDecimals?: number; message?: string } = {},
) {
  const { allowZero = false, maxDecimals = 4, message = "Введите число" } = opts;
  const re = new RegExp(`^\\d{1,14}([.,]\\d{1,${maxDecimals}})?$`);
  return z
    .string()
    .trim()
    .regex(re, { error: message })
    .refine((v) => allowZero || toNumber(v) > 0, { error: "Должно быть больше нуля" });
}

export function toNumber(value: string): number {
  return Number(value.replace(",", "."));
}
