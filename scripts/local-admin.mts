/** Учётные записи для ЛОКАЛЬНОЙ разработки и E2E. В staging/production не создаются. */
export const LOCAL_ORG_NAME = "Демо-стройка";

type LocalAccount = {
  email: string;
  password: string;
  fullName: string;
  role: "org_admin" | "foreman" | "accountant" | "warehouse";
};

export const LOCAL_ADMIN = {
  email: "admin@buildflow.local",
  password: "buildflow-local",
  fullName: "Локальный администратор",
  role: "org_admin",
} as const satisfies LocalAccount;

/** Прораб: роль без обязательной MFA. */
export const LOCAL_FOREMAN = {
  email: "foreman@buildflow.local",
  password: "buildflow-local",
  fullName: "Прораб Демо",
  role: "foreman",
} as const satisfies LocalAccount;

/** Бухгалтер: роль с обязательной MFA — E2E сброса второго фактора. */
export const LOCAL_ACCOUNTANT = {
  email: "accountant@buildflow.local",
  password: "buildflow-local",
  fullName: "Бухгалтер Демо",
  role: "accountant",
} as const satisfies LocalAccount;

/** Кладовщик: E2E восстановления пароля (пароль меняется тестом, seed возвращает исходный). */
export const LOCAL_STOREKEEPER = {
  email: "storekeeper@buildflow.local",
  password: "buildflow-local",
  fullName: "Кладовщик Демо",
  role: "warehouse",
} as const satisfies LocalAccount;

export const LOCAL_MEMBERS = [LOCAL_FOREMAN, LOCAL_ACCOUNTANT, LOCAL_STOREKEEPER] as const;
