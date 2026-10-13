"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useIdempotencyKey } from "@/lib/idempotency";
import type { ActionResult } from "@/lib/actions/result";

export type DocumentAction = {
  id: string;
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  /** Комментарий/причина обязательны (отмена, сторно, расхождение, возврат). */
  comment?: { title: string; description?: string; label: string; required: boolean };
  run: (input: { key: string; comment: string }) => Promise<ActionResult<unknown>>;
  successMessage: string;
};

/**
 * Кнопки переходов документа. Ключ идемпотентности живёт, пока операция не завершилась:
 * повторный клик/ретрай после таймаута уходит с тем же ключом — эффект один (§6.2).
 */
export function DocumentActions({ actions }: { actions: DocumentAction[] }) {
  const router = useRouter();
  const { key, renew } = useIdempotencyKey();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DocumentAction | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function execute(action: DocumentAction, text: string) {
    setError(null);
    startTransition(async () => {
      const result = await action.run({ key, comment: text });
      if (!result.ok) {
        setError(result.error);
        if (!dialog) toast.error(result.error);
        return;
      }
      toast.success(action.successMessage);
      renew();
      setDialog(null);
      setComment("");
      router.refresh();
    });
  }

  if (actions.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        {actions.map((a) => (
          <Button
            key={a.id}
            variant={a.variant ?? "default"}
            disabled={isPending}
            onClick={() => (a.comment ? (setError(null), setDialog(a)) : execute(a, ""))}
          >
            {a.label}
          </Button>
        ))}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          {dialog?.comment ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (dialog.comment?.required && comment.trim().length < 3) {
                  setError("Укажите причину (не короче 3 символов)");
                  return;
                }
                execute(dialog, comment.trim());
              }}
            >
              <DialogHeader>
                <DialogTitle>{dialog.comment.title}</DialogTitle>
                <DialogDescription className={dialog.comment.description ? undefined : "sr-only"}>
                  {dialog.comment.description ?? dialog.comment.title}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="action-comment">{dialog.comment.label}</Label>
                <textarea
                  id="action-comment"
                  rows={3}
                  className="rounded-md border bg-background p-2 text-sm"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="submit" variant={dialog.variant ?? "default"} disabled={isPending}>
                  {isPending ? "Выполняется…" : dialog.label}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
