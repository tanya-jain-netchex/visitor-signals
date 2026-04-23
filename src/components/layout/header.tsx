"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { MobileSidebar } from "./sidebar";

export function Header({
  title,
  description,
  actions,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-card/80 backdrop-blur-sm px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden -ml-2"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      <div className="flex-1 min-w-0">
        {title && (
          <h1 className="text-base font-semibold tracking-tight truncate">
            {title}
          </h1>
        )}
        {description && (
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        )}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left">
          <SheetTitle>Navigation</SheetTitle>
          <MobileSidebar />
        </SheetContent>
      </Sheet>
    </header>
  );
}
