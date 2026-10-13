import "server-only";

import { listAccounts } from "@/features/finance/queries";
import {
  listMaterialOptions,
  listProjectOptions,
  listSupplierOptions,
} from "@/features/shared/lookups";

export async function openingEditorData(orgId: string) {
  const [projects, materials, accounts, suppliers] = await Promise.all([
    listProjectOptions(orgId),
    listMaterialOptions(orgId),
    listAccounts(orgId, true),
    listSupplierOptions(orgId),
  ]);
  return {
    projects,
    materials: materials.map((m) => ({ id: m.id, label: `${m.name} (${m.unit})`, unit: m.unit })),
    accounts: accounts.map((a) => ({
      id: a.id,
      label: `${a.name} (${a.currency})`,
      currency: a.currency,
    })),
    suppliers,
  };
}
