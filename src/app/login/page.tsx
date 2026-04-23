"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto">
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <div className="space-y-1.5 text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <svg
                  viewBox="0 0 32 32"
                  className="h-7 w-7"
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
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              Netchex Visitor Signals
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your password to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium leading-none">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter access password"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full h-10 font-medium" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Visitor de-anonymization workflow
        </p>
      </div>
    </div>
  );
}
