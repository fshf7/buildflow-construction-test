import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createFixture, must, service, type Fixture } from "./setup";

// Параллельное проведение одного документа: реальные одновременные RPC, каждый — своя транзакция (Д-56).
let fx: Fixture;

beforeAll(async () => {
  fx = await createFixture("concurrency");
});

async function draftReceipt(quantity: number): Promise<string> {
  const id = randomUUID();
  must(
    await fx.storekeeper.rpc("save_goods_receipt_draft", {
      p_id: id,
      p_project_id: fx.projectId,
      p_supplier_id: fx.supplierId,
      p_purchase_request_id: null as unknown as string,
      p_note: "",
      p_correction_reason: "",
      p_lines: [{ material_id: fx.materialId, received_quantity: quantity }],
    }),
  );
  return id;
}

async function balance(): Promise<number> {
  const { data, error } = await service
    .from("stock_balances")
    .select("quantity")
    .eq("warehouse_id", fx.warehouseId)
    .eq("material_id", fx.materialId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.quantity ?? 0);
}

describe("проведение одного документа параллельно", () => {
  it("10 одновременных проведений с разными ключами — успешно ровно одно", async () => {
    const receiptId = await draftReceipt(7);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        fx.storekeeper.rpc("post_goods_receipt", { p_id: receiptId, p_key: randomUUID() }),
      ),
    );

    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(ok).toHaveLength(1);
    expect(failed.every((r) => r.error?.message === "BF_INVALID_STATUS")).toBe(true);

    const movements = must(
      await service.from("stock_movements").select("id").eq("source_doc_id", receiptId),
    );
    expect(movements).toHaveLength(1);
    expect(await balance()).toBe(7);
  });

  it("10 одновременных повторов с одним ключом — один эффект, у всех одинаковый ответ", async () => {
    const before = await balance();
    const receiptId = await draftReceipt(3);
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        fx.storekeeper.rpc("post_goods_receipt", { p_id: receiptId, p_key: key }),
      ),
    );

    expect(results.every((r) => !r.error)).toBe(true);
    const numbers = new Set(results.map((r) => (r.data as { number: string }).number));
    expect(numbers.size).toBe(1);
    expect(await balance()).toBe(before + 3);
  });

  it("параллельные выдачи одного материала не уводят остаток в минус", async () => {
    const start = await balance(); // 10
    const issues = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const id = randomUUID();
        const { data: block } = await service
          .from("blocks")
          .upsert(
            { organization_id: fx.orgId, project_id: fx.projectId, name: "Блок IT" },
            {
              onConflict: "project_id,name",
            },
          )
          .select("id")
          .single();
        const { data: floor } = await service
          .from("floors")
          .upsert(
            { organization_id: fx.orgId, project_id: fx.projectId, block_id: block!.id, name: "1" },
            { onConflict: "block_id,name" },
          )
          .select("id")
          .single();
        const { data: crew } = await service
          .from("crews")
          .upsert(
            { organization_id: fx.orgId, name: "Бригада IT" },
            { onConflict: "organization_id,name" },
          )
          .select("id")
          .single();
        must(
          await fx.storekeeper.rpc("save_material_issue_draft", {
            p_id: id,
            p_project_id: fx.projectId,
            p_block_id: block!.id,
            p_floor_id: floor!.id,
            p_crew_id: crew!.id,
            p_received_by_name: "",
            p_note: "",
            p_lines: [{ material_id: fx.materialId, quantity: 4 }],
          }),
        );
        return id;
      }),
    );

    // 5 выдач по 4 при остатке 10: пройдут ровно две, остальные — BF_NEGATIVE_STOCK.
    const results = await Promise.all(
      issues.map((id) =>
        fx.storekeeper.rpc("post_material_issue", { p_id: id, p_key: randomUUID() }),
      ),
    );
    const posted = results.filter((r) => !r.error).length;
    expect(posted).toBe(Math.floor(start / 4));
    expect(
      results.filter((r) => r.error).every((r) => r.error?.message === "BF_NEGATIVE_STOCK"),
    ).toBe(true);
    expect(await balance()).toBe(start - posted * 4);
  });
});
