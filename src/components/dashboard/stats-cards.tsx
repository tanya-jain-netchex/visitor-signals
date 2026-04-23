"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserCheck, UserX, Cloud, User, Building2 } from "lucide-react";

interface Stats {
  total: number;
  qualified: number;
  disqualified: number;
  syncedToSf: number;
  personCount: number;
  companyCount: number;
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/visitors/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const cards = [
    {
      title: "Total Visitors",
      value: stats?.total ?? 0,
      icon: Users,
      accent: "bg-primary/5 text-primary",
    },
    {
      title: "Qualified",
      value: stats?.qualified ?? 0,
      icon: UserCheck,
      accent: "bg-success/10 text-success",
    },
    {
      title: "Disqualified",
      value: stats?.disqualified ?? 0,
      icon: UserX,
      accent: "bg-destructive/10 text-destructive",
    },
    {
      title: "Synced to SF",
      value: stats?.syncedToSf ?? 0,
      icon: Cloud,
      accent: "bg-chart-2/10 text-chart-2",
    },
    {
      title: "People",
      value: stats?.personCount ?? 0,
      icon: User,
      accent: "bg-chart-1/10 text-chart-1",
    },
    {
      title: "Companies",
      value: stats?.companyCount ?? 0,
      icon: Building2,
      accent: "bg-chart-4/10 text-chart-4",
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-8 w-14" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.title} className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">
                {card.title}
              </p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.accent}`}>
                <card.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {card.value.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
