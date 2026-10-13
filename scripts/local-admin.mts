/** Учётные записи для ЛОКАЛЬНОЙ разработки и E2E. В staging/production не создаются. */
export const LOCAL_ORG_NAME = "Демо-стройка";

type LocalAccount = {
  email: string;
  password: string;
  fullName: string;
  role: "org_admin" | "foreman" | "accountant" | "warehouse" | "cashier" | "project_manager";
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

/** Кассир: роль с обязательной MFA — E2E сброса второго фактора (бухгалтер занят закупками). */
export const LOCAL_CASHIER = {
  email: "cashier@buildflow.local",
  password: "buildflow-local",
  fullName: "Кассир Демо",
  role: "cashier",
} as const satisfies LocalAccount;

/** Управляющий объекта DEMO: утверждает акты, ставит задачи и тарифы (фаза 4). */
export const LOCAL_PM = {
  email: "pm@buildflow.local",
  password: "buildflow-local",
  fullName: "Управляющий Демо",
  role: "project_manager",
} as const satisfies LocalAccount;

/** Управляющий другого объекта (WEST): проверка «чужой объект не виден». */
export const LOCAL_PM2 = {
  email: "pm2@buildflow.local",
  password: "buildflow-local",
  fullName: "Управляющий Запад",
  role: "project_manager",
} as const satisfies LocalAccount;

export const LOCAL_MEMBERS = [
  LOCAL_FOREMAN,
  LOCAL_ACCOUNTANT,
  LOCAL_STOREKEEPER,
  LOCAL_CASHIER,
  LOCAL_PM,
  LOCAL_PM2,
] as const;
