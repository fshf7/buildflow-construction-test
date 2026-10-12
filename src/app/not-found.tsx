import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Страница не найдена</h1>
      <p className="text-muted-foreground">
        Возможно, раздел ещё не реализован или ссылка устарела.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        На главную
      </Link>
    </main>
  );
}
