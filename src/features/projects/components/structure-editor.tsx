"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { addBlock, addFloor, deleteStructureItem } from "../actions";
import type { ProjectDetail } from "../queries";

/** Блоки и этажи объекта — нужны для выдачи материалов и актов работ (US-03). */
export function StructureEditor({
  project,
  canEdit,
}: {
  project: ProjectDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [blockName, setBlockName] = useState("");
  const [floorNames, setFloorNames] = useState<Record<string, string>>({});

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Ошибка");
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {project.blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Блоков пока нет. Для общеплощадочных материалов заведите блок «Общее» (Д-07).
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {project.blocks.map((block) => (
          <Card key={block.id} size="sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{block.name}</CardTitle>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Удалить блок ${block.name}`}
                  disabled={isPending}
                  onClick={() => run(() => deleteStructureItem("block", block.id, project.id))}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {block.floors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Этажей нет</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {block.floors.map((floor) => (
                    <li
                      key={floor.id}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                    >
                      {floor.name}
                      {canEdit ? (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Удалить этаж ${floor.name}`}
                          disabled={isPending}
                          onClick={() =>
                            run(() => deleteStructureItem("floor", floor.id, project.id))
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = floorNames[block.id] ?? "";
                    run(
                      () => addFloor({ projectId: project.id, blockId: block.id, name }),
                      () => setFloorNames((s) => ({ ...s, [block.id]: "" })),
                    );
                  }}
                >
                  <Input
                    placeholder="Этаж, напр. 3 или Подвал"
                    aria-label={`Новый этаж в блоке ${block.name}`}
                    value={floorNames[block.id] ?? ""}
                    onChange={(e) => setFloorNames((s) => ({ ...s, [block.id]: e.target.value }))}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="icon-lg"
                    aria-label="Добавить этаж"
                    disabled={isPending}
                  >
                    <Plus />
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {canEdit ? (
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addBlock({ projectId: project.id, name: blockName }),
              () => setBlockName(""),
            );
          }}
        >
          <Input
            placeholder="Новый блок, напр. Блок А"
            aria-label="Название нового блока"
            value={blockName}
            onChange={(e) => setBlockName(e.target.value)}
          />
          <Button type="submit" disabled={isPending}>
            Добавить блок
          </Button>
        </form>
      ) : null}
    </div>
  );
}
