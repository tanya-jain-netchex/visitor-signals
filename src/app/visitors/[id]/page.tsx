"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Mail,
  RefreshCw,
  Cloud,
  Globe,
  Building2,
  MapPin,
  Briefcase,
  Eye,
  Info,
  X,
  Send,
  Phone,
} from "lucide-react";

interface PageVisit {
  id: string;
  url: string;
  referrer: string | null;
  seenAt: string;
}

interface EnrichmentResult {
  id: string;
  source: string;
  profileData: Record<string, unknown>;
  companyData: Record<string, unknown> | null;
  enrichedAt: string;
}

interface IcpScore {
  id: string;
  totalScore: number;
  isQualified: boolean;
  tier: string;
  disqualifyReason: string | null;
  scoreBreakdown: {
    firmographics?: number;
    intent?: number;
    persona?: number;
    capacity?: number;
    disqualified?: boolean;
    reason?: string;
    details?: {
      industryScore?: number;
      companySizeScore?: number;
      locationScore?: number;
      pageIntentScore?: number;
      intentBonusScore?: number;
      titleScore?: number;
      linkedinScore?: number;
      revenueScore?: number;
      multipleViewsScore?: number;
    };
  };
  scoredAt: string;
}

interface SfSyncLog {
  id: string;
  action: string;
  sfObjectId: string | null;
  status: string;
  errorMsg: string | null;
  syncedAt: string;
}

interface OutreachMessage {
  id: string;
  subject: string;
  body: string;
  sentVia: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface Visitor {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  companyName: string | null;
  linkedinUrl: string | null;
  website: string | null;
  industry: string | null;
  employeeCount: string | null;
  estimatedRevenue: string | null;
  city: string | null;
  state: string | null;
  profileType: string;
  status: string;
  source: string;
  allTimePageViews: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  // Gong/Salesforce cache (populated via /api/visitors/[id]/gong)
  sfObjectType: string | null;
  sfId: string | null;
  sfInstanceUrl: string | null;
  priorCallCount: number | null;
  priorEmailCount: number | null;
  lastTouchpointAt: string | null;
  gongCheckedAt: string | null;
  pageVisits: PageVisit[];
  enrichment: EnrichmentResult | null;
  icpScore: IcpScore | null;
  sfSyncLogs: SfSyncLog[];
  outreachMessages: OutreachMessage[];
}

/**
 * Row in the score reasoning popover. Shows a single rule + the points it
 * contributed + the human-readable "why" (e.g. "Industry 'Accounting' is a
 * high-fit target").
 */
function ReasonRow({
  label,
  points,
  max,
  reason,
}: {
  label: string;
  points: number;
  max: number;
  reason: string;
}) {
  const earned = points > 0;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{reason}</p>
      </div>
      <span
        className={`shrink-0 font-mono text-xs tabular-nums ${
          earned ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {points}/{max}
      </span>
    </div>
  );
}

/**
 * Popover that explains why a visitor got the score they got. Toggled by the
 * info icon on the ICP Score card. Renders a breakdown of every sub-rule in
 * the scoring engine (see src/lib/scoring/rules.ts) with the points earned
 * and a plain-English reason derived from the visitor's data.
 */
function ScoreReasoningPopover({
  visitor,
  onClose,
}: {
  visitor: Visitor;
  onClose: () => void;
}) {
  const score = visitor.icpScore;
  if (!score) return null;

  // If disqualified, only the hard-disqualifier reason matters
  if (score.disqualifyReason) {
    return (
      <>
        <div
          className="fixed inset-0 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="absolute left-0 top-8 z-50 w-80 rounded-lg border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Score Reasoning</p>
              <p className="text-xs text-muted-foreground">
                Hard disqualifier — skipped soft scoring
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm text-destructive">{score.disqualifyReason}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Hard disqualifiers (free email domains, competitors, missing
              email + LinkedIn, etc.) zero out the score regardless of other
              signals.
            </p>
          </div>
        </div>
      </>
    );
  }

  const d = score.scoreBreakdown.details ?? {};

  const industryReason = visitor.industry
    ? d.industryScore === 20
      ? `Industry "${visitor.industry}" is a high-fit target`
      : d.industryScore === 10
        ? `Industry "${visitor.industry}" is a medium-fit target`
        : `Industry "${visitor.industry}" is not a target vertical`
    : "No industry data — enrich to score";

  const sizeReason = visitor.employeeCount
    ? d.companySizeScore === 10
      ? `${visitor.employeeCount} is in the 50-500 sweet spot`
      : d.companySizeScore === 5
        ? `${visitor.employeeCount} is adjacent to target size`
        : `${visitor.employeeCount} is outside target size band`
    : "No employee count — enrich to score";

  const locationReason = visitor.state
    ? `US-based (${visitor.state})`
    : "No state/location recorded";

  const titleReason = visitor.title
    ? d.titleScore === 15
      ? `"${visitor.title}" is a high-fit persona (HR/Payroll/Exec)`
      : d.titleScore === 8
        ? `"${visitor.title}" is a medium-fit persona`
        : `"${visitor.title}" is not a target buyer persona`
    : "No title data — enrich to score";

  const linkedinReason = visitor.linkedinUrl
    ? "LinkedIn URL captured"
    : "No LinkedIn URL";

  const revenueReason = visitor.estimatedRevenue
    ? d.revenueScore === 5
      ? `${visitor.estimatedRevenue} is in the $5M-$50M ICP range`
      : d.revenueScore === 3
        ? `${visitor.estimatedRevenue} is adjacent to ICP range`
        : `${visitor.estimatedRevenue} is outside ICP range`
    : "No revenue data — enrich to score";

  const viewsReason =
    visitor.allTimePageViews > 1
      ? `${visitor.allTimePageViews} page views — engaged visitor`
      : `${visitor.allTimePageViews} page view — single-touch visit`;

  const pageIntentReason =
    (d.pageIntentScore ?? 0) >= 15
      ? "Visited high-intent product pages (payroll, time, benefits)"
      : (d.pageIntentScore ?? 0) >= 7
        ? "Visited medium-intent pages (HR, onboarding, LMS)"
        : (d.pageIntentScore ?? 0) > 0
          ? "Visited low-intent pages (blog, case studies)"
          : "No intent-relevant pages visited";

  const intentBonusReason =
    d.intentBonusScore === 10
      ? "Visited /pricing or /request-demo (buying signal)"
      : "No pricing/demo page visits";

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute left-0 top-8 z-50 w-96 max-h-[70vh] overflow-y-auto rounded-lg border bg-popover shadow-lg">
        <div className="sticky top-0 flex items-center justify-between border-b bg-popover px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Score Reasoning</p>
            <p className="text-xs text-muted-foreground">
              {Math.round(score.totalScore)}/100 — how each rule scored
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-4">
          <section>
            <div className="flex items-baseline justify-between mb-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Firmographics
              </h4>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {score.scoreBreakdown.firmographics ?? 0}/40
              </span>
            </div>
            <ReasonRow label="Industry match" points={d.industryScore ?? 0} max={20} reason={industryReason} />
            <ReasonRow label="Company size" points={d.companySizeScore ?? 0} max={10} reason={sizeReason} />
            <ReasonRow label="US location" points={d.locationScore ?? 0} max={10} reason={locationReason} />
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Intent
              </h4>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {score.scoreBreakdown.intent ?? 0}/30
              </span>
            </div>
            <ReasonRow label="Page intent" points={d.pageIntentScore ?? 0} max={20} reason={pageIntentReason} />
            <ReasonRow label="High-intent bonus" points={d.intentBonusScore ?? 0} max={10} reason={intentBonusReason} />
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Persona Fit
              </h4>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {score.scoreBreakdown.persona ?? 0}/20
              </span>
            </div>
            <ReasonRow label="Title match" points={d.titleScore ?? 0} max={15} reason={titleReason} />
            <ReasonRow label="LinkedIn URL" points={d.linkedinScore ?? 0} max={5} reason={linkedinReason} />
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Capacity
              </h4>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {score.scoreBreakdown.capacity ?? 0}/10
              </span>
            </div>
            <ReasonRow label="Revenue band" points={d.revenueScore ?? 0} max={5} reason={revenueReason} />
            <ReasonRow label="Multiple page views" points={d.multipleViewsScore ?? 0} max={5} reason={viewsReason} />
          </section>

          <div className="rounded-md bg-muted/40 border px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Tiers: <span className="font-medium">75-100</span> Tier 1 (immediate outreach) ·
              <span className="font-medium"> 50-74</span> Tier 2 (nurture) ·
              <span className="font-medium"> &lt;50</span> Tier 3 (monitor only).
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy {label}
        </>
      )}
    </Button>
  );
}

function ScoreBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold tabular-nums">
          {value}<span className="text-muted-foreground font-normal">/{max}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function intentLevel(url: string): { level: string; color: string } {
  const lower = url.toLowerCase();
  if (lower.includes("pricing") || lower.includes("demo") || lower.includes("contact")) {
    return { level: "High Intent", color: "bg-success/10 text-success border-success/20" };
  }
  if (lower.includes("solution") || lower.includes("product") || lower.includes("feature")) {
    return { level: "Medium", color: "bg-warning/10 text-warning-foreground border-warning/20" };
  }
  return { level: "Low", color: "bg-secondary text-secondary-foreground border-border" };
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

/**
 * Long-text field that clamps to N lines and reveals the full text inline on
 * click. Used for LinkedIn summary (person) and company description — both of
 * which are often multi-paragraph and were previously getting truncated with
 * ellipsis and no way to see the rest.
 */
function ExpandableText({
  label,
  text,
  clampLines = 3,
}: {
  label: string;
  text: string;
  clampLines?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // Only show Show more / less if text is long enough that clamping actually
  // hides something. Threshold is approximate (~80 chars per line).
  const isLong = text.length > clampLines * 80;
  const clampClass =
    clampLines === 2
      ? "line-clamp-2"
      : clampLines === 3
        ? "line-clamp-3"
        : clampLines === 4
          ? "line-clamp-4"
          : "line-clamp-3";

  return (
    <div className="col-span-2">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p
        className={`text-sm leading-relaxed whitespace-pre-wrap ${
          expanded ? "" : clampClass
        }`}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function EnrichmentDisplay({ enrichment }: { enrichment: EnrichmentResult }) {
  const profile = enrichment.profileData as Record<string, unknown>;
  const company = enrichment.companyData as Record<string, unknown> | null;

  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const experience = Array.isArray(profile.experience)
    ? (profile.experience as Array<Record<string, unknown>>)
    : [];
  const skills = Array.isArray(profile.skills)
    ? (profile.skills as unknown[]).filter(
        (s): s is string => typeof s === "string" && s.length > 0
      )
    : [];

  return (
    <div className="space-y-5">
      {/* Person */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Person
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Name" value={[str(profile.firstName), str(profile.lastName)].filter(Boolean).join(" ") || null} />
          <Field label="Work Email" value={str(profile.email)} />
          <Field label="Title" value={str(profile.title)} />
          <Field label="Location" value={str(profile.location)} />
          {str(profile.headline) && (
            <div className="col-span-2">
              <Field label="Headline" value={str(profile.headline)} />
            </div>
          )}
          {str(profile.summary) && (
            <ExpandableText
              label="Professional Summary"
              text={str(profile.summary) as string}
              clampLines={4}
            />
          )}
        </div>
      </div>

      {/* Company */}
      {company && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Company
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Name" value={str(company.name)} />
              <Field label="Domain" value={str(company.domain)} />
              <Field label="Industry" value={str(company.industry)} />
              <Field label="Size" value={str(company.size)} />
              <Field label="Founded" value={str(company.founded)} />
              <Field label="Revenue" value={str(company.revenue)} />
              {str(company.description) && (
                <ExpandableText
                  label="Company Description"
                  text={str(company.description) as string}
                  clampLines={3}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Experience
            </p>
            <div className="space-y-2">
              {experience.slice(0, 5).map((exp, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{str(exp.title) || "—"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {str(exp.company) || "—"}
                    {(str(exp.startDate) || str(exp.endDate)) && (
                      <>
                        {" • "}
                        {str(exp.startDate) || "?"} – {exp.isCurrent ? "Present" : str(exp.endDate) || "?"}
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Skills
            </p>
            <div className="flex flex-wrap gap-1.5">
              {skills.slice(0, 20).map((skill, i) => (
                <Badge key={i} variant="secondary" className="text-xs font-normal">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function VisitorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showScoreReasoning, setShowScoreReasoning] = useState(false);

  const fetchVisitor = useCallback(async () => {
    try {
      const res = await fetch(`/api/visitors/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setVisitor(data.visitor);
      } else if (res.status === 404) {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Failed to fetch visitor:", error);
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => {
    fetchVisitor();
  }, [fetchVisitor]);

  /**
   * Hit Gong once (via our API route, which proxies the Gong public API) to
   * populate the sf* + prior* fields on this visitor. The result is cached
   * server-side on the Visitor row — subsequent dashboard loads read the cache
   * without re-calling Gong.
   */
  async function refreshGong() {
    if (!visitor) return;
    setActionLoading("gong");
    try {
      const res = await fetch(`/api/visitors/${visitor.id}/gong`, {
        method: "POST",
      });
      if (!res.ok) {
        let msg = `Gong lookup failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          /* non-JSON */
        }
        alert(msg);
      }
      await fetchVisitor();
    } catch (error) {
      console.error("Failed to refresh Gong cache:", error);
      alert("Failed to refresh Gong cache. Check the browser console.");
    } finally {
      setActionLoading(null);
    }
  }

  /**
   * Dry-run "Send via Gong Engage" — never actually pushes to Gong. Persists a
   * marker on the OutreachMessage so the demo can show the SF activity sync
   * path without sending real email to prospects.
   */
  async function sendViaGongSim(messageId: string) {
    if (!visitor) return;
    setActionLoading(`gong-send-${messageId}`);
    try {
      const res = await fetch(
        `/api/visitors/${visitor.id}/outreach/${messageId}/send-gong`,
        { method: "POST" },
      );
      if (!res.ok) {
        let msg = `Simulated send failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          /* non-JSON */
        }
        alert(msg);
      } else {
        alert(
          "Simulated send recorded. In production this would push the prospect into the configured Gong Engage Flow and sync back to Salesforce.",
        );
      }
      await fetchVisitor();
    } catch (error) {
      console.error("Simulated send failed:", error);
      alert("Simulated send failed. Check the browser console.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAction(action: "score" | "outreach" | "sync") {
    if (!visitor) return;
    setActionLoading(action);
    try {
      const endpoint =
        action === "score"
          ? `/api/visitors/${visitor.id}/score`
          : action === "outreach"
            ? `/api/visitors/${visitor.id}/outreach`
            : `/api/visitors/${visitor.id}/score`;
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        // Surface the backend error so the user isn't left staring at a
        // silently reloaded page when e.g. the LLM isn't configured or the
        // provider returned nothing usable.
        let msg = `Action failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          /* non-JSON response */
        }
        alert(msg);
      }
      await fetchVisitor();
    } catch (error) {
      console.error(`Failed to trigger ${action}:`, error);
      alert(`Failed to trigger ${action}. Check the browser console.`);
    } finally {
      setActionLoading(null);
    }
  }

  const tierLabels: Record<string, { label: string; color: string }> = {
    tier1: { label: "Tier 1 -- Immediate Outreach", color: "bg-success/10 text-success border-success/20" },
    tier2: { label: "Tier 2 -- Nurture", color: "bg-warning/10 text-warning-foreground border-warning/20" },
    tier3: { label: "Tier 3 -- Monitor", color: "bg-muted text-muted-foreground border-border" },
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <Header title="Visitor Detail" />
        <div className="flex-1 p-6 space-y-6 max-w-7xl">
          {loading ? (
            <div className="space-y-6">
              <Skeleton className="h-8 w-48" />
              <div className="grid gap-6 lg:grid-cols-2">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            </div>
          ) : !visitor ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Visitor not found.</p>
            </div>
          ) : (
            <>
              {/* Back link */}
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Link>

              {/* Header section */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold tracking-tight">
                      {[visitor.firstName, visitor.lastName]
                        .filter(Boolean)
                        .join(" ") || "Unknown Visitor"}
                    </h1>
                    <StatusBadge status={visitor.status} />
                  </div>
                  {(visitor.title || visitor.companyName) && (
                    <p className="text-muted-foreground">
                      {visitor.title}
                      {visitor.title && visitor.companyName && " at "}
                      {visitor.companyName && (
                        <span className="font-medium text-foreground">{visitor.companyName}</span>
                      )}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1">
                    {visitor.email && (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        {visitor.email}
                      </span>
                    )}
                    {visitor.linkedinUrl && (
                      <a
                        href={visitor.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        LinkedIn <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {visitor.website && (
                      <a
                        href={visitor.website.startsWith("http") ? visitor.website : `https://${visitor.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        Website
                      </a>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="default"
                    onClick={() => handleAction("score")}
                    disabled={actionLoading === "score"}
                    className="gap-2 shadow-sm"
                    title="Pushes visitor to Clay, waits for enrichment, pulls result back, and re-scores. Can take up to 90s."
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${actionLoading === "score" ? "animate-spin" : ""}`}
                    />
                    {actionLoading === "score"
                      ? "Enriching & re-scoring..."
                      : "Re-enrich & Re-score"}
                  </Button>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => handleAction("outreach")}
                    disabled={actionLoading === "outreach"}
                    className="gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    Generate Email
                  </Button>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => handleAction("sync")}
                    disabled={actionLoading === "sync"}
                    className="gap-2"
                  >
                    <Cloud className="h-4 w-4" />
                    Sync to SF
                  </Button>
                </div>
              </div>

              {/* Info grid */}
              <Card>
                <CardContent className="p-5">
                  <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
                    {visitor.industry && (
                      <InfoItem icon={Building2} label="Industry" value={visitor.industry} />
                    )}
                    {visitor.employeeCount && (
                      <InfoItem icon={Briefcase} label="Employees" value={visitor.employeeCount} />
                    )}
                    {visitor.estimatedRevenue && (
                      <InfoItem icon={Globe} label="Revenue" value={visitor.estimatedRevenue} />
                    )}
                    {(visitor.city || visitor.state) && (
                      <InfoItem
                        icon={MapPin}
                        label="Location"
                        value={[visitor.city, visitor.state].filter(Boolean).join(", ")}
                      />
                    )}
                    <InfoItem icon={Eye} label="All-time Page Views" value={String(visitor.allTimePageViews)} />
                    <InfoItem
                      icon={Globe}
                      label="Profile Type"
                      value={visitor.profileType}
                    />
                    {visitor.firstSeenAt && (
                      <InfoItem
                        icon={Eye}
                        label="First Seen"
                        value={new Date(visitor.firstSeenAt).toLocaleDateString()}
                      />
                    )}
                    {visitor.lastSeenAt && (
                      <InfoItem
                        icon={Eye}
                        label="Last Seen"
                        value={new Date(visitor.lastSeenAt).toLocaleDateString()}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* CRM & Gong touchpoints.
                  Populated on-demand via /api/visitors/[id]/gong. When not
                  checked we show a "Check Salesforce & Gong" button; when
                  checked we render the linkage + prior-activity counts. */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base">CRM & Prior Touchpoints</CardTitle>
                      <CardDescription>
                        {visitor.gongCheckedAt
                          ? `Checked via Gong ${new Date(visitor.gongCheckedAt).toLocaleString()}`
                          : "Not checked yet — resolves Salesforce link + prior Gong activity"}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshGong}
                      disabled={actionLoading === "gong" || !visitor.email}
                      className="gap-1.5"
                      title={
                        visitor.email
                          ? "Hits Gong's CRM entities + prior-activity endpoints for this email"
                          : "Visitor has no email — can't query Gong"
                      }
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${actionLoading === "gong" ? "animate-spin" : ""}`}
                      />
                      {visitor.gongCheckedAt ? "Refresh" : "Check Salesforce & Gong"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {visitor.gongCheckedAt ? (
                    <div className="grid gap-4 sm:grid-cols-3">
                      {/* Salesforce link */}
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1">Salesforce</p>
                        {visitor.sfId && visitor.sfInstanceUrl ? (
                          <a
                            href={`${visitor.sfInstanceUrl}/${visitor.sfId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                          >
                            View {visitor.sfObjectType ?? "record"}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No linked SF record
                          </p>
                        )}
                      </div>

                      {/* Prior calls */}
                      <div className="rounded-lg border p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Prior Gong calls</p>
                        </div>
                        <p className="text-sm font-semibold font-mono tabular-nums">
                          {visitor.priorCallCount ?? 0}
                        </p>
                      </div>

                      {/* Prior emails */}
                      <div className="rounded-lg border p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Prior Gong emails</p>
                        </div>
                        <p className="text-sm font-semibold font-mono tabular-nums">
                          {visitor.priorEmailCount ?? 0}
                        </p>
                      </div>

                      {visitor.lastTouchpointAt && (
                        <div className="sm:col-span-3 text-xs text-muted-foreground">
                          Last touchpoint:{" "}
                          <span className="font-medium text-foreground">
                            {new Date(visitor.lastTouchpointAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Click <span className="font-medium text-foreground">Check Salesforce & Gong</span>{" "}
                      to resolve this visitor against your CRM. Uses Gong&apos;s public API to
                      find the mapped Salesforce Lead/Contact and count any prior calls or
                      emails so reps don&apos;t start from zero.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* ICP Score Panel */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <CardTitle className="text-base">ICP Score</CardTitle>
                          {visitor.icpScore && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setShowScoreReasoning((v) => !v)}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                aria-label="How was this score calculated?"
                                aria-expanded={showScoreReasoning}
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>
                              {showScoreReasoning && (
                                <ScoreReasoningPopover
                                  visitor={visitor}
                                  onClose={() => setShowScoreReasoning(false)}
                                />
                              )}
                            </div>
                          )}
                        </div>
                        <CardDescription>
                          {visitor.icpScore
                            ? `Scored ${new Date(visitor.icpScore.scoredAt).toLocaleDateString()}`
                            : "Not scored yet"}
                        </CardDescription>
                      </div>
                      {visitor.icpScore && (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-primary">
                          <span className="text-xl font-bold font-mono">
                            {Math.round(visitor.icpScore.totalScore)}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {visitor.icpScore ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant={visitor.icpScore.isQualified ? "default" : "secondary"}
                            className="font-medium"
                          >
                            {visitor.icpScore.isQualified ? "Qualified" : "Disqualified"}
                          </Badge>
                          {tierLabels[visitor.icpScore.tier] && (
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tierLabels[visitor.icpScore.tier].color}`}>
                              {tierLabels[visitor.icpScore.tier].label}
                            </span>
                          )}
                        </div>
                        {visitor.icpScore.disqualifyReason && (
                          <div className="rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2">
                            <p className="text-sm text-destructive">
                              {visitor.icpScore.disqualifyReason}
                            </p>
                          </div>
                        )}
                        <Separator />
                        <div className="space-y-3">
                          <ScoreBar label="Firmographics" value={visitor.icpScore.scoreBreakdown.firmographics ?? 0} max={40} color="bg-chart-1" />
                          <ScoreBar label="Intent" value={visitor.icpScore.scoreBreakdown.intent ?? 0} max={30} color="bg-chart-2" />
                          <ScoreBar label="Persona Fit" value={visitor.icpScore.scoreBreakdown.persona ?? 0} max={20} color="bg-chart-3" />
                          <ScoreBar label="Capacity" value={visitor.icpScore.scoreBreakdown.capacity ?? 0} max={10} color="bg-chart-4" />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-sm text-muted-foreground mb-3">
                          No ICP score available yet.
                        </p>
                        <Button
                          size="sm"
                          onClick={() => handleAction("score")}
                          disabled={actionLoading === "score"}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${actionLoading === "score" ? "animate-spin" : ""}`} />
                          Run Scoring
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Page Visits */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Page Visits</CardTitle>
                    <CardDescription>
                      {visitor.pageVisits.length} page{visitor.pageVisits.length !== 1 ? "s" : ""} visited
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {visitor.pageVisits.length > 0 ? (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {visitor.pageVisits.map((pv) => {
                          const intent = intentLevel(pv.url);
                          return (
                            <div
                              key={pv.id}
                              className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="truncate font-mono text-xs text-foreground">
                                  {pv.url}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {new Date(pv.seenAt).toLocaleString()}
                                  {pv.referrer && ` via ${pv.referrer}`}
                                </p>
                              </div>
                              <span className={`shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${intent.color}`}>
                                {intent.level}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No page visits recorded.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Enrichment Data */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Enrichment Data</CardTitle>
                        <CardDescription>
                          {visitor.enrichment
                            ? `Source: ${visitor.enrichment.source} -- ${new Date(visitor.enrichment.enrichedAt).toLocaleDateString()}`
                            : "Not enriched yet"}
                        </CardDescription>
                      </div>
                      {visitor.enrichment && (
                        <Badge variant="secondary" className="text-xs capitalize">
                          {visitor.enrichment.source}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {visitor.enrichment ? (
                      <EnrichmentDisplay enrichment={visitor.enrichment} />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No enrichment data available. Configure Clay or Apify in Settings.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Outreach Panel */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Outreach</CardTitle>
                        <CardDescription>
                          {visitor.outreachMessages.length > 0
                            ? `${visitor.outreachMessages.length} message(s) generated`
                            : "No outreach generated"}
                        </CardDescription>
                      </div>
                      {visitor.outreachMessages.length === 0 && (
                        <Button
                          size="sm"
                          onClick={() => handleAction("outreach")}
                          disabled={actionLoading === "outreach"}
                        >
                          <Mail className="h-3.5 w-3.5 mr-1.5" />
                          Generate
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {visitor.outreachMessages.length > 0 ? (
                      <div className="space-y-4">
                        {visitor.outreachMessages.map((msg) => (
                          <div key={msg.id} className="space-y-3 rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sm">{msg.subject}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {new Date(msg.createdAt).toLocaleString()}
                                  {msg.sentVia && ` -- Sent via ${msg.sentVia}`}
                                </p>
                              </div>
                              <CopyButton text={msg.subject} label="Subject" />
                            </div>
                            <Separator />
                            <div className="text-sm whitespace-pre-wrap leading-relaxed">
                              {msg.body}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <CopyButton text={msg.body} label="Body" />
                              {/* Dry-run Gong Engage send. Never actually calls
                                  Gong — persists a "gong-engage (simulated)"
                                  marker so the demo can show the one-click
                                  flow push + SF activity sync concept without
                                  mailing prospects. */}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  actionLoading === `gong-send-${msg.id}` ||
                                  !!msg.sentAt
                                }
                                onClick={() => sendViaGongSim(msg.id)}
                                className="gap-1.5"
                                title={
                                  msg.sentAt
                                    ? "Already recorded as sent"
                                    : "Simulates pushing this prospect into a Gong Engage Flow. No real email is sent."
                                }
                              >
                                <Send className="h-3.5 w-3.5" />
                                {msg.sentAt
                                  ? "Sent (simulated)"
                                  : actionLoading === `gong-send-${msg.id}`
                                    ? "Simulating..."
                                    : "Send via Gong Engage (sim)"}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Configure an LLM provider in Settings to generate personalized outreach emails.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* SF Sync Log */}
                {visitor.sfSyncLogs.length > 0 && (
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Salesforce Sync Log</CardTitle>
                      <CardDescription>
                        {visitor.sfSyncLogs.length} sync attempt(s)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {visitor.sfSyncLogs.map((log) => (
                          <div
                            key={log.id}
                            className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                          >
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium capitalize">
                                {log.action.replace("_", " ")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(log.syncedAt).toLocaleString()}
                              </p>
                              {log.sfObjectId && (
                                <p className="text-xs font-mono text-muted-foreground">
                                  SF ID: {log.sfObjectId}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {log.errorMsg && (
                                <p className="text-xs text-destructive max-w-[200px] truncate">
                                  {log.errorMsg}
                                </p>
                              )}
                              <Badge variant={log.status === "success" ? "default" : "destructive"}>
                                {log.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
