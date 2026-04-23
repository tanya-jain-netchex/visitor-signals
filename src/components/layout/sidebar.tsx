"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Users, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Visitors",
    href: "/visitors",
    icon: Users,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            {/* Radar-ping glyph: concentric circles + centered dot.
                Matches /app/icon.svg so the sidebar mark and the browser
                favicon read as the same brand. */}
            <svg
              viewBox="0 0 32 32"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <circle
                cx="16"
                cy="16"
                r="11.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-primary-foreground/35"
              />
              <circle
                cx="16"
                cy="16"
                r="7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-primary-foreground/70"
              />
              <circle
                cx="16"
                cy="16"
                r="3.5"
                className="fill-primary-foreground"
              />
            </svg>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold tracking-tight">
              Visitor Signals
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              by Netchex
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Navigation
        </p>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Webhook Endpoint
          </p>
          <p className="text-xs font-mono text-foreground mt-1 break-all leading-relaxed">
            /api/webhook/rb2b
          </p>
        </div>
      </div>
    </aside>
  );
}

export function MobileSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 pt-4">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
