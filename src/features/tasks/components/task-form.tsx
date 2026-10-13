"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BlockOption, Option } from "@/features/shared/lookups";
import { SubmitBar } from "@/features/warehouse/components/submit-bar";

import { saveTask } from "../actions";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "../labels";

export type TaskFormInitial = {
  id: string;
  title: string;
  description: string;
  assigneeMemberId: string;
  dueDate: string;
  priority: TaskPriority;
  blockId: string;
  floorId: string;
};

/** Задача управляющего (BP-06): объект, исполнитель, срок, приоритет; блок/этаж — по желанию. */
export function TaskForm({
  projectId,
  assignees,
  blocks,
  initial,
}: {
  projectId: string;
  assignees: Option[];
  blocks: BlockOption[];
  initial?: TaskFormInitial;
}) {
  const router = useRouter();
  const [v, setV] = useState<TaskFormInitial>(
    initial ?? {
      id: crypto.randomUUID(),
      title: "",
      description: "",
      assigneeMemberId: "",
      dueDate: "",
      priority: "NORMAL",
      blockId: "",
      floorId: "",
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const floors = blocks.find((b) => b.id === v.blockId)?.floors ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveTask({ ...v, projectId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(initial ? "Задача сохранена" : `Задача ${result.data.number} создана`);
      router.push(`/tasks/${v.id}`);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="task-title">Что сделать</Label>
        <Input
          id="task-title"
          className="h-11 text-base"
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="task-assignee">Исполнитель</Label>
        <NativeSelect
          id="task-assignee"
          className="h-11 text-base"
          placeholder="Выберите"
          options={assignees.map((a) => ({ value: a.id, label: a.label }))}
          value={v.assigneeMemberId}
          onChange={(e) => setV({ ...v, assigneeMemberId: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="task-due">Срок</Label>
          <Input
            id="task-due"
            type="date"
            className="h-11 text-base"
            value={v.dueDate}
            onChange={(e) => setV({ ...v, dueDate: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="task-priority">Приоритет</Label>
          <NativeSelect
            id="task-priority"
            className="h-11 text-base"
            options={Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            value={v.priority}
            onChange={(e) => setV({ ...v, priority: e.target.value as TaskPriority })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="task-block">Блок</Label>
          <NativeSelect
            id="task-block"
            className="h-11 text-base"
            placeholder="—"
            options={blocks.map((b) => ({ value: b.id, label: b.name }))}
            value={v.blockId}
            onChange={(e) => setV({ ...v, blockId: e.target.value, floorId: "" })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="task-floor">Этаж</Label>
          <NativeSelect
            id="task-floor"
            className="h-11 text-base"
            placeholder="—"
            options={floors.map((f) => ({ value: f.id, label: f.name }))}
            value={v.floorId}
            onChange={(e) => setV({ ...v, floorId: e.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="task-description">Подробности</Label>
        <textarea
          id="task-description"
          rows={4}
          className="rounded-md border bg-background p-2 text-base"
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </div>
      <SubmitBar
        pending={isPending}
        label={initial ? "Сохранить" : "Создать задачу"}
        error={error}
      />
    </form>
  );
}
