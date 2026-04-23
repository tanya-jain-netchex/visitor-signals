import { cn } from "@/lib/utils";
import { Check, AlertCircle, Loader2, Sparkles } from "lucide-react";

type VisitorStatus =
  | "NEW"
  | "ENRICHING"
  | "ENRICHED"
  | "SCORING"
  | "QUALIFIED"
  | "DISQUALIFIED"
  | "SYNCED_TO_SF"
  | "ERROR";

const statusConfig: Record<
  VisitorStatus,
  { label: string; className: string; icon?: React.ElementType }
> = {
  NEW: {
    label: "New",
    className: "bg-secondary text-secondary-foreground border-border",
  },
  ENRICHING: {
    label: "Enriching",
    className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    icon: Loader2,
  },
  ENRICHED: {
    label: "Enriched",
    className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    icon: Check,
  },
  SCORING: {
    label: "Scoring",
    className: "bg-chart-4/10 text-chart-4 border-chart-4/20",
    icon: Loader2,
  },
  QUALIFIED: {
    label: "Qualified",
    className: "bg-success/10 text-success border-success/20",
    icon: Sparkles,
  },
  DISQUALIFIED: {
    label: "Disqualified",
    className: "bg-muted text-muted-foreground border-border",
  },
  SYNCED_TO_SF: {
    label: "Synced to SF",
    className: "bg-primary text-primary-foreground border-primary",
    icon: Check,
  },
  ERROR: {
    label: "Error",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    icon: AlertCircle,
  },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as VisitorStatus] || {
    label: status,
    className: "bg-secondary text-secondary-foreground border-border",
  };
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        config.className
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "h-3 w-3",
            (status === "ENRICHING" || status === "SCORING") && "animate-spin"
          )}
        />
      )}
      {config.label}
    </span>
  );
}
