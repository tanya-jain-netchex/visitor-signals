"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  X,
  AlertCircle,
  Info,
  Target,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface IcpConfig {
  scoreThreshold: number;
  rules: {
    targetIndustries: { high: string[]; medium: string[] };
    highFitTitles: string[];
    mediumFitTitles: string[];
  };
  disqualifiers: {
    freeDomains: string[];
    competitors: string[];
    internal: string[];
  };
}

/**
 * Tag-style list editor. Shows each item as a removable chip and exposes a
 * single-line input for adding new items. Used for every editable list on
 * this page (industries, titles, disqualifier domains).
 */
function ListEditor({
  label,
  description,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const t = draft.trim();
    if (!t) return;
    // Case-insensitive dedup
    if (items.some((i) => i.toLowerCase() === t.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, t]);
    setDraft("");
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[2rem] p-2 rounded-lg border bg-muted/30">
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            (empty — add items below)
          </span>
        )}
        {items.map((item, idx) => (
          <span
            key={`${item}-${idx}`}
            className="inline-flex items-center gap-1 rounded-md bg-background border px-2 py-0.5 text-xs font-medium"
          >
            {item}
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label={`Remove ${item}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-9"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={!draft.trim()}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

export default function IcpSettingsPage() {
  const [config, setConfig] = useState<IcpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasStoredConfig, setHasStoredConfig] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/icp-config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setHasStoredConfig(data.hasStoredConfig);
      }
    } catch (err) {
      console.error("Failed to load ICP config:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/icp-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaved(true);
        setHasStoredConfig(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  function update(patch: Partial<IcpConfig>) {
    if (!config) return;
    setConfig({ ...config, ...patch });
  }

  function updateRules(patch: Partial<IcpConfig["rules"]>) {
    if (!config) return;
    setConfig({ ...config, rules: { ...config.rules, ...patch } });
  }

  function updateIndustries(patch: Partial<IcpConfig["rules"]["targetIndustries"]>) {
    if (!config) return;
    setConfig({
      ...config,
      rules: {
        ...config.rules,
        targetIndustries: { ...config.rules.targetIndustries, ...patch },
      },
    });
  }

  function updateDisqualifiers(patch: Partial<IcpConfig["disqualifiers"]>) {
    if (!config) return;
    setConfig({
      ...config,
      disqualifiers: { ...config.disqualifiers, ...patch },
    });
  }

  if (loading || !config) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-4">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Settings
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <h1 className="text-base font-semibold">ICP Scoring Rules</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Scoring Criteria
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Edit the target industries, buyer personas, and disqualifier domains the
            scoring engine uses. Changes apply to all future scoring runs
            immediately.
          </p>
          {!hasStoredConfig && (
            <div className="flex items-start gap-2 mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10 px-3 py-2">
              <Info className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                You&rsquo;re viewing the built-in defaults. Click Save to persist a
                custom config to the database &mdash; after that, your edits
                override the defaults for all future scoring.
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Score threshold */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Qualification Threshold</CardTitle>
                <CardDescription>
                  Minimum total score (out of 100) required to mark a visitor as
                  Qualified. Tiers: Tier 1 &ge; 75, Tier 2 &ge; 50, Tier 3 &lt; 50.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 max-w-xs">
              <Input
                type="number"
                min={0}
                max={100}
                value={config.scoreThreshold}
                onChange={(e) =>
                  update({ scoreThreshold: Number(e.target.value) })
                }
                className="h-10"
              />
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
          </CardContent>
        </Card>

        {/* Industries */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Target Industries</CardTitle>
                <CardDescription>
                  Firmographic scoring looks at visitor industry. High-fit earns
                  the full 20/20 on the industry sub-score; medium-fit earns
                  10/20. Matching is case-insensitive substring.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <ListEditor
              label="High-fit industries (20 pts)"
              description="Netchex's primary verticals"
              items={config.rules.targetIndustries.high}
              onChange={(next) => updateIndustries({ high: next })}
              placeholder="e.g. Restaurants"
            />
            <ListEditor
              label="Medium-fit industries (10 pts)"
              description="Adjacent or secondary verticals"
              items={config.rules.targetIndustries.medium}
              onChange={(next) => updateIndustries({ medium: next })}
              placeholder="e.g. Professional Services"
            />
          </CardContent>
        </Card>

        {/* Titles */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Buyer Personas (Titles)</CardTitle>
                <CardDescription>
                  Persona fit scoring matches visitor&rsquo;s job title. High-fit
                  earns 15/15; medium-fit earns 8/15. Match is
                  case-insensitive substring, so &ldquo;hr&rdquo; catches
                  &ldquo;HR Director&rdquo;, &ldquo;Senior HR Generalist&rdquo;,
                  etc.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <ListEditor
              label="High-fit titles (15 pts)"
              description="Primary decision makers / budget holders"
              items={config.rules.highFitTitles}
              onChange={(next) => updateRules({ highFitTitles: next })}
              placeholder="e.g. HR Director"
            />
            <ListEditor
              label="Medium-fit titles (8 pts)"
              description="Influencers, champions, end-users"
              items={config.rules.mediumFitTitles}
              onChange={(next) => updateRules({ mediumFitTitles: next })}
              placeholder="e.g. Office Manager"
            />
          </CardContent>
        </Card>

        {/* Disqualifier domains */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <Ban className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-base">
                  Hard Disqualifier Domains
                </CardTitle>
                <CardDescription>
                  Any visitor whose email domain matches these lists is marked
                  Disqualified with score 0. Domains are normalized to lowercase
                  on save.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10 px-3 py-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Free email domains only disqualify when the visitor has no
                LinkedIn URL &mdash; otherwise enrichment can still find a work
                email.
              </p>
            </div>
            <ListEditor
              label="Free email domains"
              description="Personal email providers — only DQs if no LinkedIn URL"
              items={config.disqualifiers.freeDomains}
              onChange={(next) => updateDisqualifiers({ freeDomains: next })}
              placeholder="e.g. gmail.com"
            />
            <ListEditor
              label="Competitor domains"
              description="Immediate DQ — don't waste outreach on competitor employees"
              items={config.disqualifiers.competitors}
              onChange={(next) => updateDisqualifiers({ competitors: next })}
              placeholder="e.g. paychex.com"
            />
            <ListEditor
              label="Internal domains"
              description="Netchex employees & own company — never pitch to ourselves"
              items={config.disqualifiers.internal}
              onChange={(next) => updateDisqualifiers({ internal: next })}
              placeholder="e.g. netchex.com"
            />
          </CardContent>
        </Card>

        {/* Save footer */}
        <Card className="sticky bottom-4 shadow-lg">
          <CardFooter className="py-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Saving creates a new active IcpConfig. Existing IcpScore records
              are preserved (for history).
            </p>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved
                </>
              ) : (
                "Save Scoring Rules"
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
