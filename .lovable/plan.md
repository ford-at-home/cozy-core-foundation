## Fix the Print button on `/print/$runId`

**Problem:** `handlePrint` calls `iframeRef.current?.contentWindow?.print()` on a `srcDoc` iframe. In Chromium/Safari this frequently no-ops unless the iframe is focused first, and some browsers block `print()` on `srcDoc` frames entirely. Result: clicking Print appears to do nothing.

**Fix (frontend only, `src/routes/_authenticated/print.$runId.tsx`):**

1. In `handlePrint`, focus the iframe's contentWindow before calling `print()`:
   ```ts
   const win = iframeRef.current?.contentWindow;
   if (!win) return;
   win.focus();
   win.print();
   ```
2. Add a robust fallback: if `print()` throws or the iframe isn't ready, open the rendered document in a new window (`window.open('', '_blank')`, `document.write(srcDoc)`, `window.print()`), which is the reliable cross-browser path for printing arbitrary HTML.
3. Ensure the iframe is ready before enabling Print: track an `onLoad` state and only enable the button once the iframe has loaded its `srcDoc` (prevents clicking before the print stylesheet is applied).
4. No changes to `print.css`, the markdown rendering, or the data fetch.

**Out of scope:** changing the print layout, anchors, or any backend/data logic.