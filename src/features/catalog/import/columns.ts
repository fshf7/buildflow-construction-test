/** Колонки шаблонов импорта справочников (Д-85). Цен в справочниках нет. */
export type ImportKind = "materials" | "suppliers" | "crews";

export type ImportColumn = {
  key: string;
  header: string;
  required: boolean;
  example: string;
  hint?: string;
};

export const IMPORT_KINDS: Record<ImportKind, { title: string; columns: ImportColumn[] }> = {
  materials: {
    title: "Материалы",
    columns: [
      { key: "name", header: "Название", required: true, example: "Цемент М400" },
      {
        key: "unit_code",
        header: "Единица",
        required: true,
        example: "меш",
        hint: "код единицы: шт, кг, т, м, м², м³, л, меш",
      },
      {
        key: "code",
        header: "Код",
        required: false,
        example: "CEM-400",
        hint: "если указан — сопоставление по коду",
      },
      { key: "category", header: "Категория", required: false, example: "Сыпучие" },
    ],
  },
  suppliers: {
    title: "Поставщики",
    columns: [
      { key: "name", header: "Название", required: true, example: "ООО «СтройСнаб»" },
      {
        key: "tax_id",
        header: "ИНН",
        required: false,
        example: "0123456789",
        hint: "если указан — сопоставление по ИНН",
      },
      { key: "phone", header: "Телефон", required: false, example: "+992 900 00 00 01" },
      { key: "contact_person", header: "Контактное лицо", required: false, example: "Иванов И." },
      { key: "address", header: "Адрес", required: false, example: "г. Душанбе" },
    ],
  },
  crews: {
    title: "Бригады",
    columns: [
      { key: "name", header: "Название", required: true, example: "Бригада Каримова" },
      { key: "leader_name", header: "Бригадир", required: false, example: "Каримов Б." },
      { key: "phone", header: "Телефон", required: false, example: "+992 900 00 00 02" },
      {
        key: "foreman_email",
        header: "Email прораба",
        required: false,
        example: "foreman@company.tj",
        hint: "ответственный прораб — участник с ролью «Прораб»",
      },
    ],
  },
};

export function isImportKind(v: unknown): v is ImportKind {
  return v === "materials" || v === "suppliers" || v === "crews";
}

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
