"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./status-badge";
import { ChevronLeft, ChevronRight, Search, ArrowRight } from "lucide-react";

interface Visitor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
  title: string | null;
  status: string;
  profileType: string;
  source: string;
  lastSeenAt: string | null;
  allTimePageViews: number;
  icpScore: {
    totalScore: number;
    tier: string;
    isQualified: boolean;
  } | null;
  _count: {
    pageVisits: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function ScorePill({ score, tier }: { score: number; tier: string }) {
  const rounded = Math.round(score);
  let colorClass = "bg-muted text-muted-foreground";
  if (tier === "tier1") colorClass = "bg-success/10 text-success font-semibold";
  else if (tier === "tier2") colorClass = "bg-warning/10 text-warning-foreground font-semibold";

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono ${colorClass}`}>
      {rounded}
    </span>
  );
}

export function VisitorTable() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") || ""
  );

  const page = parseInt(searchParams.get("page") || "1");
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "20");
      if (status !== "all") params.set("status", status);
      if (search) params.set("search", search);

      const res = await fetch(`/api/visitors?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVisitors(data.visitors);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch visitors:", error);
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    if (!updates.page) {
      params.delete("page");
    }
    router.push(`?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParams({ search: searchInput });
  }

  function visitorName(v: Visitor) {
    const name = [v.firstName, v.lastName].filter(Boolean).join(" ");
    return name || v.email || "Unknown";
  }

  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "NEW", label: "New" },
    { value: "ENRICHING", label: "Enriching" },
    { value: "ENRICHED", label: "Enriched" },
    { value: "SCORING", label: "Scoring" },
    { value: "QUALIFIED", label: "Qualified" },
    { value: "DISQUALIFIED", label: "Disqualified" },
    { value: "SYNCED_TO_SF", label: "Synced to SF" },
    { value: "ERROR", label: "Error" },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, company..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" size="default">
            Search
          </Button>
        </form>
        <select
          value={status}
          onChange={(e) => updateParams({ status: e.target.value })}
          className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Company</TableHead>
              <TableHead className="hidden md:table-cell font-semibold">Title</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="hidden sm:table-cell font-semibold">Score</TableHead>
              <TableHead className="hidden lg:table-cell font-semibold">Pages</TableHead>
              <TableHead className="hidden xl:table-cell font-semibold">Last Seen</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j} className={j > 4 ? "hidden lg:table-cell" : j > 3 ? "hidden sm:table-cell" : ""}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : visitors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm text-muted-foreground">No visitors found.</p>
                    <p className="text-xs text-muted-foreground">
                      Try adjusting your search or filters.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visitors.map((visitor) => (
                <TableRow
                  key={visitor.id}
                  className="group cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => router.push(`/visitors/${visitor.id}`)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium group-hover:text-primary transition-colors">
                        {visitorName(visitor)}
                      </p>
                      {visitor.email && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {visitor.email}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {visitor.companyName || "--"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {visitor.title || "--"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={visitor.status} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {visitor.icpScore ? (
                      <ScorePill
                        score={visitor.icpScore.totalScore}
                        tier={visitor.icpScore.tier}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm font-mono text-muted-foreground">
                      {visitor._count.pageVisits}
                    </span>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                    {visitor.lastSeenAt
                      ? new Date(visitor.lastSeenAt).toLocaleDateString()
                      : "--"}
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>
            {" - "}
            <span className="font-medium text-foreground">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>
            {" of "}
            <span className="font-medium text-foreground">{pagination.total}</span>
            {" visitors"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() =>
                updateParams({ page: (pagination.page - 1).toString() })
              }
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2 font-mono">
              {pagination.page} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() =>
                updateParams({ page: (pagination.page + 1).toString() })
              }
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
