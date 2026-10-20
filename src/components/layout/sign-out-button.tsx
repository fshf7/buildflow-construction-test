"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { clearAllDrafts, DRAFTS_CLEARED_EVENT } from "@/lib/form-draft-store";

/** «Выйти»: перед выходом стираем с устройства несохранённый ввод форм (useFormDraft). */
export function SignOutButton() {
  function forgetDrafts() {
    window.dispatchEvent(new Event(DRAFTS_CLEARED_EVENT));
    try {
      clearAllDrafts(localStorage);
    } catch {
      /* localStorage недоступен — нечего чистить */
    }
  }

  return (
    <form action={signOut} onSubmit={forgetDrafts}>
      <Button
        type="submit"
        variant="outline"
        size="icon-lg"
        className="size-10 rounded-full"
        aria-label="Выйти"
      >
        <LogOut className="size-5" />
      </Button>
    </form>
  );
}
