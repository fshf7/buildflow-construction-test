"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";

import { addTaskComment } from "../actions";

/** Обсуждение задачи. Повтор отправки с тем же id не создаёт дубль. */
export function TaskComments({
  taskId,
  comments,
  canComment,
}: {
  taskId: string;
  comments: { id: string; body: string; createdAt: string; author: string }[];
  canComment: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addTaskComment({ taskId, id, body });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBody("");
      setId(crypto.randomUUID());
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Обсуждение</h2>
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Комментариев нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {c.author} · {formatDateTime(c.createdAt)}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canComment ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Label htmlFor="task-comment" className="sr-only">
            Комментарий
          </Label>
          <textarea
            id="task-comment"
            rows={2}
            placeholder="Комментарий"
            className="rounded-md border bg-background p-2 text-base"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={isPending || !body.trim()}>
            {isPending ? "Отправка…" : "Отправить"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
