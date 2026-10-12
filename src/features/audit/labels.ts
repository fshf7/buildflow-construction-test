/** Подписи для журнала аудита. Неизвестные таблицы/поля показываются как есть. */
export const TABLE_LABELS: Record<string, string> = {
  organizations: "Организация",
  organization_members: "Участник",
  roles: "Роль",
  permissions: "Право",
  member_roles: "Роль участника",
  projects: "Объект",
  project_members: "Назначение на объект",
  blocks: "Блок",
  floors: "Этаж",
  warehouses: "Склад",
  units_of_measure: "Единица измерения",
  materials: "Материал",
  suppliers: "Поставщик",
};

export const ACTION_LABELS: Record<string, string> = {
  INSERT: "Создание",
  UPDATE: "Изменение",
  DELETE: "Удаление",
};

const IGNORED_FIELDS = new Set(["updated_at", "created_at", "created_by", "id", "organization_id"]);

/** Какие поля изменились (для UPDATE) — без служебных. */
export function changedFields(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): string[] {
  if (!oldData || !newData) return [];
  return Object.keys(newData).filter(
    (k) => !IGNORED_FIELDS.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]),
  );
}

/** Короткое описание записи: название/ФИО/код, если есть. */
export function recordTitle(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  for (const key of ["name", "full_name", "code", "email"]) {
    const v = data[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}
