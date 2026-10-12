import { parseArgs } from "node:util";

import { z } from "zod";

/** Аргументы `npm run org:create -- --name … --admin-email … --admin-name … [--yes] [--password …]`. */
export const orgCreateArgsSchema = z.object({
  name: z.string().trim().min(2, { error: "--name: название организации" }),
  adminEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "--admin-email: корректный email первого администратора" })),
  adminName: z.string().trim().min(2, { error: "--admin-name: ФИО администратора" }),
  yes: z.boolean(),
  // Только для локальной БД: создать пользователя сразу с паролем, без письма-приглашения.
  password: z.string().min(10, { error: "--password: не короче 10 символов" }).optional(),
});

export type OrgCreateArgs = z.infer<typeof orgCreateArgsSchema>;

export function parseOrgCreateArgs(argv: string[]): OrgCreateArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: "string" },
      "admin-email": { type: "string" },
      "admin-name": { type: "string" },
      password: { type: "string" },
      yes: { type: "boolean", default: false },
    },
    strict: true,
  });
  const result = orgCreateArgsSchema.safeParse({
    name: values.name ?? "",
    adminEmail: values["admin-email"] ?? "",
    adminName: values["admin-name"] ?? "",
    password: values.password,
    yes: values.yes ?? false,
  });
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => i.message).join("\n"));
  }
  return result.data;
}

export function isLocalUrl(url: string): boolean {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(url).hostname);
}
