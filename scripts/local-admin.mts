/** Учётные записи для ЛОКАЛЬНОЙ разработки и E2E. В staging/production не создаются. */
export const LOCAL_ORG_NAME = "Демо-стройка";

export const LOCAL_ADMIN = {
  email: "admin@buildflow.local",
  password: "buildflow-local",
  fullName: "Локальный администратор",
} as const;

/** Прораб: роль без обязательной MFA — для E2E без второго фактора. */
export const LOCAL_FOREMAN = {
  email: "foreman@buildflow.local",
  password: "buildflow-local",
  fullName: "Прораб Демо",
} as const;
