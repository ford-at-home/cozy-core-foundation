## Remove demo login + add style presets, make both required

### 1. Remove the demo admin sign-in (`src/routes/auth.tsx`)

- Delete the "Sign in as demo admin" button and the divider spacing it needed.
- Remove `adminLoading`, `handleAdmin`, the `ensureAdmin`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` imports, and drop `adminLoading` from `busy`.
- Leave `src/lib/admin.functions.ts` untouched (server fn stays; only the UI entrypoint goes away).

### 2. Style + Image-style presets (`src/routes/_authenticated/profile.tsx`)

Add a horizontal row of preset "chips" above each textarea. Clicking a chip fills the corresponding textarea with a pre-written paragraph (overwrites current content after a confirm if the field is non-empty and different from a known preset; otherwise fills silently). A small "Custom" chip clears back to empty for dictation/free-typing.

**Text-style presets (5):**

- **Plainspoken essayist** — short sentences, concrete nouns, one idea per paragraph, no throat-clearing.
- **Punchy operator** — first person, direct, opinionated, ends sections with a takeaway line.
- **Warm storyteller** — scene-first openings, sensory detail, quiet endings, contractions welcome.
- **Analytical explainer** — defines terms early, uses numbered structure, cites evidence inline.
- **Dry wit** — understated, occasional aside, never sarcastic-for-its-own-sake, lands on a clean line.

**Image-style presets (5):**

- **Ink & wash journal** — hand-drawn ink on off-white paper, loose linework, muted washes, never photoreal.
- **Editorial photo** — 35mm color photo, natural light, shallow depth of field, documentary framing.
- **Flat vector** — flat geometric shapes, 3–4 color palette, thick outlines, no gradients.
- **Risograph print** — 2-color riso, visible grain and misregistration, warm paper stock.
- **Minimal line art** — single-weight black line on white, generous whitespace, no shading.

The exact preset copy lives in a `PRESETS` constant at the top of the file so the AI reads the same string that populates the textarea. Selecting a chip also sets `dirty = true` so Save enables.

### 3. Make both fields required

- The Save button is disabled unless `styleText.trim()` AND `imageStyle.trim()` are both non-empty (in addition to the existing `dirty` gate).
- Show an inline hint under Save: "Both Style and Image style are required." when either is empty.
- Update the image-style helper copy to drop "Leave blank to skip images." — images are no longer optional at profile-save time.
- Server function `saveProfile` (`src/lib/profile.functions.ts`) also rejects empty strings so a stale client cannot bypass the check; returns a clear error message the UI surfaces via existing `saveError`.
- `new.tsx`'s `hasStyle` gate stays as-is; a stronger `hasImageStyle` check is out of scope for this turn.

### Out of scope

- Redesigning the profile page layout.
- Adding an admin-role gate elsewhere in the app.
- Backfilling `image_style` for existing profiles (older rows keep whatever they have; users must fill it in on next edit).
