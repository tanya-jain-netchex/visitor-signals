#!/usr/bin/env bash
# Capture the 6 screenshots used by the demo deck (docs/demo-deck.pptx).
#
# Usage: bash scripts/capture-demo-screenshots.sh
#
# macOS only — uses the built-in `screencapture` tool. Each prompt gives you
# a crosshair; drag-select the browser window (or a region) and the image lands
# in public/screenshots/ with the exact filename the deck expects.
#
# Tip: before running, open Chrome at http://localhost:3000, log in, and have
# each target page ready in a separate tab. Tab order recommended:
#   1. /login
#   2. /dashboard
#   3. /visitors/<a tier-1 visitor> (with Score Reasoning popover open)
#   4. /visitors/<same visitor> (with CRM/Gong card populated)
#   5. /visitors/<same visitor> (scrolled to a generated outreach email)
#   6. /settings
set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/screenshots"
mkdir -p "$OUT_DIR"

capture() {
  local name="$1"
  local hint="$2"
  echo
  echo "▶ Capturing: $name"
  echo "  Target: $hint"
  echo "  Press Return, then drag to select the region…"
  read -r
  screencapture -i -x "$OUT_DIR/$name.png"
  if [ -f "$OUT_DIR/$name.png" ]; then
    echo "  ✓ Saved $OUT_DIR/$name.png"
  else
    echo "  ✗ Cancelled — skipped $name"
  fi
}

echo "Netchex Visitor Signals — demo screenshot capture"
echo "Output → $OUT_DIR"

capture 01-login       "The login page at /login"
capture 02-dashboard   "The /dashboard with the visitor table and stats cards visible"
capture 03-score       "A visitor detail page with the Score Reasoning popover open"
capture 04-crm         "A visitor detail page with the CRM & Prior Touchpoints card populated (post-check)"
capture 05-outreach    "A visitor detail page scrolled to a generated outreach email"
capture 06-settings    "The /settings page showing the Gong section + ICP + prompt editor"

echo
echo "Done. Reopen docs/demo-deck.pptx — the images refresh on open."
