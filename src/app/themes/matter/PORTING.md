# Porting the Matter theme into the real app

You are picking up a finished design exploration at `src/app/themes/matter/page.tsx`
and porting it into the actual Read-It-Later app (the routes outside `/themes`).

This document is the contract. Read it end-to-end before touching code.

---

## 0. What "done" means

A new selectable theme called **Matter** that is visually indistinguishable
from `/themes/matter` (both light and dark variants), wired into the existing
theme switcher, applied across:

- Sidebar (`AppSidebar.tsx`)
- Article list / cards (`article-list.tsx`, `article-card.tsx`)
- Article reader + header (`article-reader.tsx`, `article-reader-header.tsx`)
- Audio / TTS player surface (`audio-player.tsx`)
- Top app shell (whatever wraps the routes; check `src/app/_components/layout.tsx`)
- Global search bar (`search-bar.tsx`) — must use the hover-expand interaction
  exactly as implemented in the preview

Acceptance test: open the app, switch to "Matter" in the theme switcher, then
open the preview at `/themes/matter` in another tab. Side-by-side, palette,
typography, spacing, and animations should match within a hair.

---

## 1. Files you MUST read first, in this order

1. `src/app/themes/matter/page.tsx` — the source of truth. Every value
   (palette, fonts, animation curves, durations, border radii) is in here.
2. `src/styles/globals.css` — search for `html[data-theme=` to see how the
   existing themes (`ember`, `parchment`, `forest`, `cobalt`) are defined
   with `oklch()` tokens.
3. `src/app/_components/theme-switcher.tsx` — wiring pattern for adding a
   new theme to the switcher menu and the pre-hydration script in
   `src/app/layout.tsx` that reads `localStorage.ril.theme`.
4. `src/app/_components/article-reader.tsx` and
   `src/app/_components/article-reader-header.tsx` — the real reading surface
   you are restyling.
5. `src/app/_components/AppSidebar.tsx` — the real sidebar you are restyling.
6. `src/app/_components/article-card.tsx` and
   `src/app/_components/article-list.tsx` — the real queue.
7. `src/app/_components/search-bar.tsx` — the real search you are replacing
   the visuals of.

Do not modify the preview file. It must remain a living reference.

---

## 2. Design tokens — copy these into globals.css

Add two new theme blocks. Use oklch to match the rest of the file's
convention. Approximate hex equivalents are commented for cross-check
against the preview.

```css
html[data-theme="matter"] {
  /* Matter — Paper (light) */
  --background:        oklch(0.9700 0.0140 85);   /* #FAF6EE */
  --background-deep:   oklch(0.9450 0.0180 85);   /* #F2ECDF */
  --surface:           oklch(1.0000 0 0);          /* #FFFFFF */
  --foreground:        oklch(0.2000 0.0140 50);   /* #1C1A17 */
  --foreground-soft:   oklch(0.3700 0.0150 55);   /* #4A4540 */
  --muted-foreground:  oklch(0.6100 0.0180 65);   /* #8A8379 */
  --rule:              oklch(0.9000 0.0220 80);   /* #E4DCC9 */
  --accent:            oklch(0.6300 0.1900 35);   /* #E94B27 */
  --accent-foreground: oklch(0.9900 0 0);
  --highlight-yellow:  oklch(0.9300 0.1500 95);   /* #F7E98A */
  --highlight-peach:   oklch(0.8800 0.0700 60);   /* #FBD9B8 */
  --ring:              oklch(0.6300 0.1900 35);
  --radius: 0.875rem; /* matches rounded-2xl / 14px */
}

html[data-theme="matter-dark"] {
  /* Matter — Winter (dark, warm near-black) */
  --background:        oklch(0.1700 0.0120 65);   /* #16130F */
  --background-deep:   oklch(0.2050 0.0140 70);   /* #1F1B16 */
  --surface:           oklch(0.2150 0.0140 70);   /* #221E18 */
  --foreground:        oklch(0.9100 0.0420 85);   /* #EFE6D2 */
  --foreground-soft:   oklch(0.7300 0.0380 80);   /* #B8AE9A */
  --muted-foreground:  oklch(0.5300 0.0250 70);   /* #7A7264 */
  --rule:              oklch(0.2700 0.0140 70);   /* #2C2720 */
  --accent:            oklch(0.7100 0.1700 35);   /* #F26A47 */
  --accent-foreground: oklch(0.1500 0 0);
  --highlight-yellow:  oklch(0.5400 0.1100 80);   /* #7A6722 */
  --highlight-peach:   oklch(0.4900 0.1100 35);   /* #7A4528 */
  --ring:              oklch(0.7100 0.1700 35);
  --radius: 0.875rem;
}
```

> `--background-deep`, `--surface`, `--rule`, `--highlight-*` are NEW token
> names. Wire them through `@theme` in globals.css the same way the existing
> ones (`--color-background`, `--color-accent`, etc.) are exposed to Tailwind.
> Components must read these via Tailwind utility (`bg-background-deep`,
> `border-rule`, etc.) — never hard-code hex inside components.

---

## 3. Typography

Add to the project's font loading (next/font config or the `<head>`,
whichever pattern this app uses; check `src/app/layout.tsx`):

| Family             | Weights              | Used for                          |
| ------------------ | -------------------- | --------------------------------- |
| Inter              | 400, 500, 600, 700   | All UI chrome (sidebar, buttons)  |
| Newsreader         | 400, 500, 600        | Page headings, article titles     |
| Source Serif 4     | 400, 500, 600        | Article body prose only           |

Usage rules (copy from `matter/page.tsx`):

- `h1` / `h2` / hero: `Newsreader`, `font-weight: 500`, `tracking-tight`,
  `leading-[1.05]` for display sizes.
- Article body in the reader: `Source Serif 4`, `text-[19px]`,
  `leading-[1.7]`, `space-y-6` between paragraphs, max column width `640px`.
- Pull quotes: `Newsreader` italic, `text-[22px]`, `leading-[1.45]`,
  `border-l-2 pl-6`, border color `var(--accent)`.
- Everything else: Inter.

Do NOT use the system serif. Source Serif 4 has the right warmth — Georgia
makes it feel like a 2008 blog.

---

## 4. Component-by-component port

### 4.1 Sidebar (`AppSidebar.tsx`)

Replace the current "glass on dark" header with the Matter pattern:

- Drop the gradient header background and the gradient logo blob.
- Logo: 28×28 square, `rounded-[8px]`, `bg-accent`, white serif `M` (Newsreader,
  font-weight 700, letter-spacing -0.03em).
- No section labels above primary nav. ONE hairline divider (`h-px bg-rule mx-3`)
  between the primary nav block and the Collections block. That is the only
  separator in the sidebar.
- Nav item: `rounded-lg px-3 py-2 text-sm`, hover `bg-foreground/10`,
  active row also `bg-foreground/10` and `font-weight: 600`. Item icon
  becomes `text-accent` only when active.
- Counts on the right are `text-xs tabular-nums text-muted-foreground`.
- Footer user block: simplify to avatar + name + menu trigger. Drop the
  rounded card wrapper, drop the email line. The avatar background is
  `bg-accent` (not the blue→purple gradient).

### 4.2 Article list (`article-list.tsx` + `article-card.tsx`)

Match the queue rows in `<QueueRow />`:

- Container: a single rounded `rounded-2xl border border-rule bg-surface`
  block with `divide-y divide-rule` between rows. NOT individual cards.
- Row: `flex items-start gap-4 px-6 py-5`, hover applies `bg-foreground/10`.
- Title: Newsreader, `text-[17px]`, `font-weight: 500`, `leading-snug`.
- Excerpt: `text-sm leading-relaxed text-foreground-soft`,
  `line-clamp-2`.
- Meta line: `text-[11px] text-muted-foreground`, only `domain · readingTime min`.
  No author, no savedAgo, no tag chips on the row.
- Source favicon: 16×16 `rounded-[4px]`, white initial, hue picked from a
  fixed 5-color palette by `domain.length % 5` (see `SourceFavicon`).

A "Continue reading" hero card sits ABOVE the list when there is exactly
one in-progress article. Hero matches `<article>` in the preview: 2-column
grid (text + gradient art panel), `rounded-2xl border border-rule
bg-surface`, hover lifts -2px with `shadow` from `--shadow-soft`.

Drop "Up next" headings, sort dropdowns, etc. The list speaks for itself.

### 4.3 Reader (`article-reader.tsx` + `article-reader-header.tsx`)

This is the most important surface. Copy the `<Reader>` component from the
preview as the visual spec.

- Reader is a slide-in overlay from the right edge, `max-w-[880px]`,
  `bg-background`, `box-shadow: var(--shadow-strong)`. Backdrop is
  `bg-foreground/30` with `backdrop-blur-[4px]`. Click backdrop → close.
  Esc → close.
- Slide animation: 380ms `cubic-bezier(0.2, 0.8, 0.2, 1)`. Backdrop fades
  500ms ease.
- Top bar inside the reader: `← Close` left, favicon + domain + min center,
  ONLY two icon buttons right (`Aa`, `★`). Anything else lives behind
  `Aa`'s settings popover.
- Reading progress: 2px bar under the top bar, fills `--accent`, width
  driven by scroll progress of the inner scroller. 150ms width transition.
- Body column: `max-w-[640px] mx-auto`, `pt-12 pb-36 px-8`.
- Header eyebrow: NONE. The article title comes first.
- Author block: ONE muted line — `author · domain`. No avatar, no
  savedAgo. (Bring savedAgo back if PMs object, but try without first.)
- Paragraphs fade-up on mount with 80ms stagger. Respect
  `prefers-reduced-motion`.

### 4.4 Audio / TTS player (`audio-player.tsx`)

Match the floating bar at the bottom of the reader:

- Position: `absolute right-6 bottom-6 left-6` inside the reader.
- Container: `rounded-2xl border border-rule bg-surface px-4 py-3`,
  `box-shadow: var(--shadow-strong)`.
- Layout: play button (40px circle, `bg-accent`, white glyph) → equalizer
  bars (only when playing) → title+meta → `1×` speed button. Drop the
  ±30s skip buttons. They're not in the design.
- When playing, the play button gets the `m-pulse` keyframe (2.2s
  ease-in-out infinite, ring expanding from accent to transparent).
- EQ bars: 5 thin vertical bars, animated by `m-bar` keyframe with 120ms
  staggered `animation-delay`.

### 4.5 Top bar + global search (`search-bar.tsx`)

CRITICAL — preserve the search bar interaction exactly. See `<SearchBox>`
in the preview.

- Idle state: 36px square, just the `⌕` glyph, no border, no fill.
- Hover OR focus OR `value.length > 0`: expands to `280px` over **320ms
  cubic-bezier(0.2, 0.8, 0.2, 1)**, fills with `bg-background-deep`,
  border `1px solid var(--rule)`.
- Input fades in 220ms ease with 80ms delay (lets the width animate first).
- `⌘K` chip: visible only when expanded AND empty. Fades 180ms.
- Sticky expanded state when `value.length > 0` is React state, not pure
  CSS — the existing search input should already have controlled `value`
  state, just compute `expanded = hover || focus || value.length > 0`.
- Wire the real `⌘K` / `Ctrl+K` listener to `inputRef.current?.focus()`.

The animation curve `cubic-bezier(0.2, 0.8, 0.2, 1)` is the project's
de-facto easing for this theme — use it everywhere a transform/width/opacity
moves.

---

## 5. Animations — extract to globals.css

The preview defines its keyframes inline via `<style dangerouslySetInnerHTML>`.
For the real app, hoist them into `globals.css` under the matter theme blocks
(or globally — they're scoped enough by class name that global is fine):

```css
@keyframes matter-fade-up {
  from { opacity: 0; transform: translate3d(0, 14px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes matter-slide-in { /* 24px from right, 380ms */ }
@keyframes matter-highlight { /* background-size 0% → 100% */ }
@keyframes matter-pulse     { /* ring expand from accent */ }
@keyframes matter-progress  { /* width 0 → var(--p) */ }
@keyframes matter-bar       { /* scaleY 0.35 → 1 → 0.35 */ }
```

And the helper utility classes (`.m-fade-up`, `.m-slide-in`, `.m-hl`,
`.m-pulse`, `.m-bar`, `.m-d-0`..`.m-d-6` stagger delays).

Wrap them all in:

```css
@media (prefers-reduced-motion: reduce) {
  .m-fade-up, .m-slide-in, .m-hl, .m-hl-peach,
  .m-progress-fill, .m-pulse, .m-bar {
    animation: none !important;
  }
  .m-hl, .m-hl-peach { background-size: 100% 48%; }
}
```

This is non-negotiable. Do not ship motion without the reduced-motion guard.

---

## 6. Theme switcher wiring

`theme-switcher.tsx` currently lists `ember`, `parchment`, `forest`, `cobalt`.

1. Add two entries: `matter` (Paper) and `matter-dark` (Winter).
2. The pre-hydration script in `src/app/layout.tsx` already reads
   `localStorage.ril.theme` and applies it to `<html data-theme>`. No changes
   needed there beyond confirming the new slugs round-trip.
3. The preview page persists its own toggle to `localStorage.ril.themes.matter.mode`
   — that key is for the PREVIEW only. Do not collide. The real theme
   selector is `localStorage.ril.theme`.

If product wants Matter to feel like one theme with a light/dark toggle (it
should), add a separate light/dark switch that flips between `matter` and
`matter-dark` only when the active theme starts with `matter`.

---

## 7. Hard rules — DON'T

- Don't introduce framer-motion. The preview is intentionally CSS-only and
  the package has not been added.
- Don't hard-code hex values inside components. All color goes through
  CSS variables.
- Don't change the column width. Reading column is 640px. PMs will ask.
  Keep it.
- Don't add a "View on web" / "Reader settings" / "Share" cluster of icons
  to the reader top bar. Aa + star. That is the design.
- Don't change cursor type, hit targets, or focus rings without checking
  with a designer — these have been tuned to feel Matter-like.
- Don't replace Newsreader with a system serif "to save a font request".
  The serif IS the brand here.

---

## 8. Hard rules — DO

- Use the project's package manager: `pnpm`, never `npm` or `yarn`.
- After edits, run `pnpm typecheck` AND `pnpm lint` and ensure your changes
  introduce no new errors. Pre-existing lint errors in unrelated files are
  fine — leave them alone.
- Test both `data-theme="matter"` and `data-theme="matter-dark"` before
  declaring done. Checkpoint: open the reader, scroll mid-article, toggle
  light↔dark — nothing should jump, only colors transition.
- Verify `prefers-reduced-motion: reduce` (devtools → Rendering → Emulate
  CSS media feature) → no animations should play.
- Never run git commands. The user runs all git commands themselves. Stage
  nothing, commit nothing.

---

## 9. Suggested order of operations

1. Add the two `html[data-theme="matter*"]` blocks + new tokens in
   `globals.css`. Add the keyframes + utility classes.
2. Add Matter to `theme-switcher.tsx`. Verify the page just looks "wrong
   but tinted right" when you flip to it — that's expected; components
   haven't been restyled yet.
3. Restyle `AppSidebar.tsx` against §4.1.
4. Restyle `article-list.tsx` + `article-card.tsx` against §4.2. This is
   the biggest visual change.
5. Restyle `article-reader.tsx` + `article-reader-header.tsx` against §4.3.
6. Restyle `audio-player.tsx` against §4.4.
7. Replace the visuals + interaction of `search-bar.tsx` against §4.5.
8. Walk through both light and dark, screenshot, diff against
   `/themes/matter`. Iterate.

---

## 10. Out of scope (don't do)

- Changing data, queries, or backend behavior. This is purely visual.
- Adding new app features (collections page, highlights export, etc.) just
  because the preview hints at them. Render existing data; don't invent
  schema.
- Rewriting the `/themes` preview pages.

If you find an existing component whose API doesn't allow the new look
without invasive refactors, stop and ask — don't rewrite ten layers of
shadcn primitives without buy-in.
