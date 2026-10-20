"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { NavLinks } from "./nav-links";

export function MobileNav({
  permissions,
  projects,
}: {
  permissions: readonly string[];
  projects: readonly { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          className="size-10 rounded-full md:hidden"
          aria-label="Открыть меню"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-none bg-panel p-0 text-panel-foreground">
        <SheetHeader className="border-b border-panel-muted px-5 py-4">
          <SheetTitle className="text-panel-foreground">BuildFlow</SheetTitle>
          <SheetDescription className="sr-only">Разделы системы</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto p-3">
          <NavLinks
            permissions={permissions}
            projects={projects}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
