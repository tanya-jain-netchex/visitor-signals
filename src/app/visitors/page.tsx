"use client";

import { Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { VisitorTable } from "@/components/dashboard/visitor-table";
import { Skeleton } from "@/components/ui/skeleton";

export default function VisitorsPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <Header
          title="All Visitors"
          description="Complete list of identified visitors"
        />
        <div className="flex-1 p-6">
          <Suspense
            fallback={
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-[500px] w-full rounded-xl" />
              </div>
            }
          >
            <VisitorTable />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
