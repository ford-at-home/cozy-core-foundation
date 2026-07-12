#!/usr/bin/env bash
# Print-contract sync check. The S{n}P{m} block-anchor counting rule is defined
# twice — in CSS (src/styles/print.css) for the printed page and in prose
# (contract/references/MARKUP.md) for the revision agent that resolves
# annotations. This check can't prove the two rules are semantically identical,
# but it mechanically guards the load-bearing markers of the shared rule and
# the US Letter geometry, so a partial edit of one side fails fast.
set -euo pipefail
cd "$(dirname "$0")/.."

CSS="src/styles/print.css"
MD="contract/references/MARKUP.md"
ROUTE="src/routes/_authenticated/print.\$runId.tsx"
fail=0

require() { # file, pattern, description
  if ! grep -qE "$2" "$1"; then
    echo "FAIL: $1 — missing: $3 (pattern: $2)"
    fail=1
  fi
}

[ -f "$CSS" ] || { echo "FAIL: $CSS not found"; exit 1; }
[ -f "$MD" ] || { echo "FAIL: $MD not found"; exit 1; }

echo "== page geometry (US Letter everywhere) =="
require "$CSS" 'size: *letter' "@page size: letter"
require "$CSS" 'margin: *1\.5in 2in 1\.5in 1\.5in' "wide markup margins (1.5in 2in 1.5in 1.5in)"
require "$ROUTE" 'format: *"letter"' "html2pdf jsPDF format: letter"
require "$ROUTE" 'margin: *\[1\.5, *2, *1\.5, *1\.5\]' "html2pdf margins matching @page"
if grep -qiE 'size: *a4|format: *"a4"' "$CSS" "$ROUTE"; then
  echo "FAIL: A4 sizing found — this product is US Letter only."
  fail=1
fi

echo "== anchor rule markers present on both sides =="
# CSS side: counters + exclusions + sync comment
require "$CSS" 'counter-increment: *section' "section counter on headings"
require "$CSS" 'counter-set: *para 0' "counter-set para 0 on headings (NOT counter-reset — see comment in file)"
require "$CSS" 'is\(p, blockquote, pre, table\)' "para counter over p/blockquote/pre/table"
require "$CSS" 'MARKUP\.md' "sync comment referencing MARKUP.md"
# Prose side: the same rule, stated for the revision agent
require "$MD" 'Pre-Printed Block Anchors' "anchor section heading"
require "$MD" 'starts at 0' "section counter starts at 0 (first heading = S1)"
require "$MD" 'List items' "list items excluded from counting"
require "$MD" 'one anchor per quote' "blockquote counts as a single block"

echo "== iframe isolation =="
require "$ROUTE" "print\.css\?raw" "print.css imported as raw text (iframe srcDoc), not as a global stylesheet"
bad_imports=$(grep -RnE "import .*styles/print\.css" src --include='*.tsx' --include='*.ts' 2>/dev/null | grep -v '\?raw' || true)
if [ -n "$bad_imports" ]; then
  echo "FAIL: print.css is imported globally (must only be inlined via ?raw):"
  echo "$bad_imports"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "check-print-contract: FAILED"
  exit 1
fi
echo "check-print-contract: OK"
