"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  Database,
  Brain,
  Cloud,
  Phone,
  Zap,
  Target,
  ChevronRight,
  MessageSquare,
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface SettingState {
  hasValue: boolean;
  enabled: boolean;
  lastFour?: string;
}

type SettingsMap = Record<string, SettingState>;

interface FieldConfig {
  key: string;
  label: string;
  type: "password" | "text" | "select" | "textarea";
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
  rows?: number;
  help?: string;
}

interface SectionConfig {
  id: string;
  title: string;
  description: string;
  enabledKey: string;
  fields: FieldConfig[];
  note?: string;
  icon: React.ElementType;
}

const sections: SectionConfig[] = [
  {
    id: "clay",
    title: "Clay",
    description:
      "Primary enrichment provider. We push visitor data to your Clay table's inbound webhook, Clay enriches, then Clay's HTTP API column POSTs the enriched row back to our callback endpoint.",
    enabledKey: "clay_enabled",
    icon: Database,
    fields: [
      {
        key: "clay_webhook_url",
        label: "Clay Table Webhook URL (inbound)",
        type: "password",
        placeholder: "https://api.clay.com/v3/sources/webhook/...",
      },
    ],
    note: "Setup: 1) Paste the inbound webhook URL from your Clay table's source. 2) In Clay, add an HTTP API column at the end of your table that POSTs to `<your-app>/api/webhook/clay/results` with a JSON body containing `visitor_id` plus every enrichment column (see README/docs). 3) Set the HTTP API column's run condition so it only fires when enrichment finishes. Falls back to Apify if Clay is disabled.",
  },
  {
    id: "apify",
    title: "Apify",
    description:
      "Fallback LinkedIn enrichment. Only your API token is needed — actors are pre-configured (LinkedIn profile scrapers).",
    enabledKey: "apify_enabled",
    icon: Zap,
    fields: [
      {
        key: "apify_api_key",
        label: "API Token",
        type: "password",
        placeholder: "apify_api_...",
      },
    ],
    note: "Actor: harvestapi~linkedin-profile-scraper (LinkedIn profile data from URL)",
  },
  {
    id: "llm",
    title: "LLM Provider",
    description:
      "AI provider for generating personalized outreach emails based on visitor data and page visits.",
    enabledKey: "llm_enabled",
    icon: Brain,
    fields: [
      {
        key: "llm_api_key",
        label: "API Key",
        type: "password",
        placeholder: "Enter API key",
      },
      {
        key: "llm_provider",
        label: "Provider",
        type: "select",
        options: [
          { value: "openai", label: "OpenAI (gpt-4o-mini)" },
          { value: "anthropic", label: "Anthropic (claude-sonnet-4)" },
          { value: "gemini", label: "Google Gemini (gemini-2.5-flash)" },
        ],
      },
    ],
  },
  {
    id: "salesforce",
    title: "Salesforce",
    description:
      "Sync qualified visitors as leads into your Salesforce CRM instance.",
    enabledKey: "sf_enabled",
    icon: Cloud,
    fields: [
      {
        key: "sf_instance_url",
        label: "Instance URL",
        type: "text",
        placeholder: "https://your-org.my.salesforce.com",
      },
      {
        key: "sf_client_id",
        label: "Client ID",
        type: "password",
        placeholder: "Enter SF client ID",
      },
      {
        key: "sf_client_secret",
        label: "Client Secret",
        type: "password",
        placeholder: "Enter SF client secret",
      },
      {
        key: "sf_refresh_token",
        label: "Refresh Token",
        type: "password",
        placeholder: "Enter SF refresh token",
      },
    ],
  },
  {
    id: "gong",
    title: "Gong Engage",
    description:
      "Resolves each visitor to the mapped Salesforce record and counts prior calls/emails so reps never start from zero. Also powers the simulated 'Send via Gong Engage' button on each outreach message.",
    enabledKey: "gong_enabled",
    icon: Phone,
    fields: [
      {
        key: "gong_base_url",
        label: "API Base URL",
        type: "text",
        placeholder: "https://us-12345.api.gong.io",
        help: "Tenant-specific. Found in Gong → Settings → API → Connect.",
      },
      {
        key: "gong_access_key",
        label: "Access Key",
        type: "password",
        placeholder: "Paste Access Key",
      },
      {
        key: "gong_access_key_secret",
        label: "Access Key Secret",
        type: "password",
        placeholder: "Paste Access Key Secret",
      },
      {
        key: "gong_default_flow_id",
        label: "Default Flow ID (optional)",
        type: "text",
        placeholder: "e.g. 123456789",
        help: "Used by the 'Send via Gong Engage' button. Leave blank to simulate without a flow.",
      },
      {
        key: "gong_default_flow_name",
        label: "Default Flow Name (optional)",
        type: "text",
        placeholder: "e.g. Netchex Inbound Outreach",
      },
    ],
    note: "This demo never actually sends email through Gong — the 'Send via Gong Engage' button records a simulated-send marker on the outreach message. Read endpoints (CRM mapping, prior activity) are real and use Gong's public REST API with HTTP Basic auth.",
  },
];

function PromptEditorSection() {
  const [template, setTemplate] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/prompt-template");
      if (res.ok) {
        const data = await res.json();
        setTemplate(data.template ?? "");
        setIsCustom(!!data.isCustom);
        setEnabled(!!data.enabled);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/prompt-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, enabled: true }),
      });
      if (res.ok) {
        setIsCustom(true);
        setEnabled(true);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset prompt to the built-in default? Your custom version will be deleted.")) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/prompt-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setTemplate(data.template ?? "");
        setIsCustom(false);
        setEnabled(false);
      }
    } finally {
      setResetting(false);
    }
  }

  const placeholders = [
    "name",
    "firstName",
    "fullName",
    "title",
    "company",
    "industry",
    "companySize",
    "revenue",
    "pagesVisited",
    "productContext",
    "personaName",
    "personaFocus",
    "personaTone",
    "enrichmentContext",
    "companyStats",
    "companyTagline",
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Outreach Email Prompt</CardTitle>
                {isCustom && enabled && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Check className="h-3 w-3" />
                    Custom
                  </Badge>
                )}
              </div>
              <CardDescription>
                The exact prompt sent to the LLM when generating a personalized
                outreach email. Use <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{placeholder}}"}</code> tokens to
                inject visitor data at send time.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-template" className="text-sm">
                Prompt Template
              </Label>
              <textarea
                id="prompt-template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={20}
                className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono leading-relaxed ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                spellCheck={false}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Available placeholders:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {placeholders.map((p) => (
                  <code
                    key={p}
                    className="rounded bg-background border px-1.5 py-0.5 text-[11px] font-mono"
                  >
                    {`{{${p}}}`}
                  </code>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4 bg-muted/20 gap-2">
        <Button onClick={handleSave} disabled={saving || loading} className="gap-1.5">
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
            "Save Prompt"
          )}
        </Button>
        {isCustom && (
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={resetting || loading}
            className="gap-1.5"
          >
            {resetting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              "Reset to Default"
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function SettingSection({
  section,
  settings,
  onSave,
}: {
  section: SectionConfig;
  settings: SettingsMap;
  onSave: (
    updates: { key: string; value: string; enabled: boolean }[]
  ) => Promise<void>;
}) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(
    settings[section.enabledKey]?.enabled ?? false
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnabled(settings[section.enabledKey]?.enabled ?? false);
  }, [settings, section.enabledKey]);

  function handleFieldChange(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const updates: { key: string; value: string; enabled: boolean }[] = [];

      updates.push({
        key: section.enabledKey,
        value: enabled ? "true" : "false",
        enabled,
      });

      for (const field of section.fields) {
        const value = fieldValues[field.key];
        if (value !== undefined && value !== "") {
          updates.push({ key: field.key, value, enabled: true });
        }
      }

      await onSave(updates);
      setSaved(true);
      setFieldValues({});
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const isConfigured = section.fields.some((f) => settings[f.key]?.hasValue);
  const Icon = section.icon;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{section.title}</CardTitle>
                {isConfigured && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Check className="h-3 w-3" />
                    Configured
                  </Badge>
                )}
              </div>
              <CardDescription>{section.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <Label
              htmlFor={`${section.id}-enabled`}
              className="text-xs text-muted-foreground"
            >
              {enabled ? "On" : "Off"}
            </Label>
            <Switch
              id={`${section.id}-enabled`}
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>
        {section.note && (
          <p className="text-xs text-muted-foreground mt-3 bg-muted/50 rounded-lg px-3 py-2 border">
            {section.note}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {section.fields.map((field) => {
          const setting = settings[field.key];
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key} className="text-sm">
                {field.label}
                {setting?.hasValue && setting.lastFour && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (current: ****{setting.lastFour})
                  </span>
                )}
              </Label>
              {field.type === "select" ? (
                <select
                  id={field.key}
                  value={fieldValues[field.key] ?? ""}
                  onChange={(e) =>
                    handleFieldChange(field.key, e.target.value)
                  }
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">
                    {setting?.hasValue && setting.lastFour
                      ? `Current: ****${setting.lastFour}`
                      : "Select provider..."}
                  </option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={field.key}
                  type={field.type}
                  placeholder={
                    setting?.hasValue
                      ? `****${setting.lastFour || ""} (leave blank to keep)`
                      : field.placeholder
                  }
                  value={fieldValues[field.key] ?? ""}
                  onChange={(e) =>
                    handleFieldChange(field.key, e.target.value)
                  }
                />
              )}
              {field.help && (
                <p className="text-xs text-muted-foreground">{field.help}</p>
              )}
            </div>
          );
        })}
      </CardContent>
      <CardFooter className="border-t pt-4 bg-muted/20">
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
            "Save Changes"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        const map: SettingsMap = {};
        for (const s of data.settings) {
          map[s.key] = {
            hasValue: s.hasValue,
            enabled: s.enabled,
            lastFour: s.lastFour,
          };
        }
        setSettings(map);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave(
    updates: { key: string; value: string; enabled: boolean }[]
  ) {
    for (const update of updates) {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
    }
    await fetchSettings();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
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
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <h1 className="text-base font-semibold">Settings</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Integrations
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure API keys and credentials for each service. All values are
            encrypted at rest with AES-256-GCM.
          </p>
        </div>
        <Separator />
        {sections.map((section) => (
          <SettingSection
            key={section.id}
            section={section}
            settings={settings}
            onSave={handleSave}
          />
        ))}

        <Separator />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Scoring</h2>
          <p className="text-sm text-muted-foreground mt-1">
            What counts as a qualified lead? Edit the industries, buyer
            personas, and disqualifier domains the scoring engine uses.
          </p>
        </div>

        <Link href="/settings/icp" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base">ICP Scoring Rules</CardTitle>
                    <CardDescription>
                      Target industries, buyer personas (titles), free-email /
                      competitor / internal domain disqualifiers, and the
                      qualification threshold.
                    </CardDescription>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Separator />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Outreach</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The exact prompt used to generate personalized cold emails. Edit to
            match your team&apos;s voice.
          </p>
        </div>

        <PromptEditorSection />
      </div>
    </div>
  );
}
