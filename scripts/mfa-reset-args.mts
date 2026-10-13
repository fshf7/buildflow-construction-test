import { parseArgs } from "node:util";

import { z } from "zod";

/** `npm run mfa:reset -- --email … --reason "…" --yes` */
export const mfaResetArgsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "--email: email пользователя" })),
  reason: z.string().trim().min(3, { error: "--reason: причина сброса (обязательна)" }),
  yes: z.literal(true, {
    error: "--yes: подтвердите сброс (действие завершит все сессии пользователя)",
  }),
});

export type MfaResetArgs = z.infer<typeof mfaResetArgsSchema>;

export function parseMfaResetArgs(argv: string[]): MfaResetArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      email: { type: "string" },
      reason: { type: "string" },
      yes: { type: "boolean", default: false },
    },
    strict: true,
  });
  const result = mfaResetArgsSchema.safeParse({
    email: values.email ?? "",
    reason: values.reason ?? "",
    yes: values.yes ?? false,
  });
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join("\n"));
  return result.data;
}
