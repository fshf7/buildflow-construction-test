"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";

import { DataTable, type DataTableFeatures } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { colorPill } from "../expense-colors";
import type { ExpenseCategoryRow, MaterialRow, SupplierRow, UnitRow } from "../queries";

import { ExpenseCategoryForm } from "./expense-category-form";
import { FormDialog } from "./form-dialog";
import { MaterialForm } from "./material-form";
import { SupplierForm } from "./supplier-form";
import { UnitForm } from "./unit-form";

const editButton = (label: string) => (
  <Button variant="ghost" size="icon-sm" aria-label={`Изменить: ${label}`}>
    <Pencil />
  </Button>
);

const addButton = (label: string) => (
  <Button>
    <Plus />
    {label}
  </Button>
);

const archived = (active: boolean) => (active ? null : <Badge variant="secondary">Архив</Badge>);

// ---- Единицы измерения ----
const unitHelper = createColumnHelper<DataTableFeatures, UnitRow>();
const unitColumns = unitHelper.columns([
  unitHelper.accessor("code", { header: "Обозначение" }),
  unitHelper.accessor("name", { header: "Название" }),
  unitHelper.accessor("decimals", { header: "Знаков" }),
  unitHelper.display({
    id: "edit",
    header: "",
    cell: (info) => (
      <FormDialog trigger={editButton(info.row.original.name)} title="Единица измерения">
        {(close) => <UnitForm unit={info.row.original} onSaved={close} />}
      </FormDialog>
    ),
  }),
]);

export function UnitsSection({ units }: { units: UnitRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <FormDialog trigger={addButton("Добавить единицу")} title="Новая единица измерения">
          {(close) => <UnitForm onSaved={close} />}
        </FormDialog>
      </div>
      <DataTable columns={unitColumns} data={units} />
    </div>
  );
}

// ---- Материалы ----
const materialHelper = createColumnHelper<DataTableFeatures, MaterialRow>();

export function MaterialsSection({
  materials,
  units,
}: {
  materials: MaterialRow[];
  units: UnitRow[];
}) {
  // Колонкам нужен список единиц для формы — собираем при рендере (список короткий).
  const columns = materialHelper.columns([
    materialHelper.accessor("name", {
      header: "Материал",
      cell: (info) => (
        <span className="flex items-center gap-2">
          {info.getValue()} {archived(info.row.original.isActive)}
        </span>
      ),
    }),
    materialHelper.accessor("unitCode", { header: "Ед." }),
    materialHelper.accessor("category", {
      header: "Категория",
      cell: (info) => info.getValue() ?? "—",
    }),
    materialHelper.accessor("code", { header: "Код", cell: (info) => info.getValue() ?? "—" }),
    materialHelper.display({
      id: "edit",
      header: "",
      cell: (info) => (
        <FormDialog trigger={editButton(info.row.original.name)} title="Материал">
          {(close) => <MaterialForm material={info.row.original} units={units} onSaved={close} />}
        </FormDialog>
      ),
    }),
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <FormDialog trigger={addButton("Добавить материал")} title="Новый материал">
          {(close) => <MaterialForm units={units} onSaved={close} />}
        </FormDialog>
      </div>
      <DataTable columns={columns} data={materials} empty="Материалов пока нет" />
    </div>
  );
}

// ---- Поставщики ----
const supplierHelper = createColumnHelper<DataTableFeatures, SupplierRow>();
const supplierColumns = supplierHelper.columns([
  supplierHelper.accessor("name", {
    header: "Поставщик",
    cell: (info) => (
      <span className="flex items-center gap-2">
        {info.getValue()} {archived(info.row.original.isActive)}
      </span>
    ),
  }),
  supplierHelper.accessor("taxId", { header: "ИНН", cell: (info) => info.getValue() ?? "—" }),
  supplierHelper.accessor("phone", { header: "Телефон", cell: (info) => info.getValue() ?? "—" }),
  supplierHelper.accessor("contactPerson", {
    header: "Контакт",
    cell: (info) => info.getValue() ?? "—",
  }),
  supplierHelper.display({
    id: "edit",
    header: "",
    cell: (info) => (
      <FormDialog trigger={editButton(info.row.original.name)} title="Поставщик">
        {(close) => <SupplierForm supplier={info.row.original} onSaved={close} />}
      </FormDialog>
    ),
  }),
]);

export function SuppliersSection({ suppliers }: { suppliers: SupplierRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <FormDialog trigger={addButton("Добавить поставщика")} title="Новый поставщик">
          {(close) => <SupplierForm onSaved={close} />}
        </FormDialog>
      </div>
      <DataTable columns={supplierColumns} data={suppliers} empty="Поставщиков пока нет" />
    </div>
  );
}

// ---- Категории затрат (Д-97) ----
const categoryHelper = createColumnHelper<DataTableFeatures, ExpenseCategoryRow>();

const categoryColumns = categoryHelper.columns([
  categoryHelper.accessor("name", {
    header: "Категория",
    cell: (info) => (
      <span className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-sm ${colorPill(info.row.original.color)}`}
        >
          {info.getValue()}
        </span>
        {archived(info.row.original.isActive)}
      </span>
    ),
  }),
  categoryHelper.accessor("viaWarehouse", {
    header: "Через склад",
    cell: (info) => (info.getValue() ? "Да" : "Нет"),
  }),
  categoryHelper.accessor("sortOrder", { header: "Порядок" }),
  categoryHelper.display({
    id: "edit",
    header: "",
    cell: (info) => (
      <FormDialog trigger={editButton(info.row.original.name)} title="Категория затрат">
        {(close) => <ExpenseCategoryForm category={info.row.original} onSaved={close} />}
      </FormDialog>
    ),
  }),
]);

export function ExpenseCategoriesSection({ categories }: { categories: ExpenseCategoryRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <FormDialog trigger={addButton("Добавить категорию")} title="Новая категория затрат">
          {(close) => <ExpenseCategoryForm onSaved={close} />}
        </FormDialog>
      </div>
      <DataTable columns={categoryColumns} data={categories} />
    </div>
  );
}
