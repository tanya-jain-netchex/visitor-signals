"use client";

import { Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { VisitorTable } from "@/components/dashboard/visitor-table";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <Header
          title="Dashboard"
          description="Website visitor de-anonymization overview"
        />
        <div className="flex-1 space-y-8 p-6">
          <StatsCards />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Recent Visitors
                </h2>
                <p className="text-sm text-muted-foreground">
                  Browse and filter identified website visitors
                </p>
              </div>
            </div>
            <Suspense
              fallback={
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-[400px] w-full rounded-xl" />
                </div>
              }
            >
              <VisitorTable />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
