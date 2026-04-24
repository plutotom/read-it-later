"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MOCK_ARTICLES } from "../_data/mock-articles";

/**
 * Matter-homage theme page. Mimics the reading app Matter as closely as
 * possible without lifting their assets: warm paper palette (or warm dark),
 * coral accent, serif body / sans UI, stacked queue list, slide-in reader,
 * TTS bar, and auto-demo highlight animation.
 *
 * Light palette ≈ Matter's "Paper". Dark palette ≈ Matter's "Winter" — a
 * warm near-black, not pure #000, so paper stock still feels like paper at
 * night.
 *
 * Animations are all CSS keyframes so we don't pull in framer-motion.
 */

type Mode = "light" | "dark";

interface Palette {
  accent: string;
  paper: string;
  paperDeep: string;
  surface: string;
  ink: string;
  inkSoft: string;
  inkMute: string;
  rule: string;
  highlight: string;
  highlightPeach: string;
  shadowSoft: string;
  shadowStrong: string;
  scrim: string;
  topBarBg: string;
  chip: string;
}

const LIGHT: Palette = {
  accent: "#E94B27",
  paper: "#FAF6EE",
  paperDeep: "#F2ECDF",
  surface: "#FFFFFF",
  ink: "#1C1A17",
  inkSoft: "#4A4540",
  inkMute: "#8A8379",
  rule: "#E4DCC9",
  highlight: "#F7E98A",
  highlightPeach: "#FBD9B8",
  shadowSoft: "0 14px 30px -18px rgba(28,26,23,0.25)",
  shadowStrong: "0 20px 40px -20px rgba(28,26,23,0.3)",
  scrim: "rgba(28,26,23,0.3)",
  topBarBg: "rgba(250,246,238,0.9)",
  chip: "#F2ECDF",
};

const DARK: Palette = {
  accent: "#F26A47",
  paper: "#16130F",
  paperDeep: "#1F1B16",
  surface: "#221E18",
  ink: "#EFE6D2",
  inkSoft: "#B8AE9A",
  inkMute: "#7A7264",
  rule: "#2C2720",
  highlight: "#7A6722",
  highlightPeach: "#7A4528",
  shadowSoft: "0 14px 30px -18px rgba(0,0,0,0.6)",
  shadowStrong: "0 20px 50px -20px rgba(0,0,0,0.8)",
  scrim: "rgba(0,0,0,0.55)",
  topBarBg: "rgba(22,19,15,0.85)",
  chip: "#1F1B16",
};

const cssFor = (p: Palette) => `
@keyframes matter-fade-up {
  from { opacity: 0; transform: translate3d(0, 14px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes matter-fade-in {
  from { opacity: 0; } to { opacity: 1; }
}
@keyframes matter-slide-in {
  from { opacity: 0; transform: translate3d(24px, 0, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes matter-highlight {
  from { background-size: 0% 48%; }
  to   { background-size: 100% 48%; }
}
@keyframes matter-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 ${p.accent}59; }
  50%      { transform: scale(1.04); box-shadow: 0 0 0 8px ${p.accent}00; }
}
@keyframes matter-progress {
  from { width: 0%; } to { width: var(--p, 46%); }
}
@keyframes matter-bar {
  0%, 100% { transform: scaleY(0.35); }
  50%      { transform: scaleY(1); }
}
.m-fade-up { animation: matter-fade-up 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.m-fade-in { animation: matter-fade-in 500ms ease both; }
.m-slide-in { animation: matter-slide-in 380ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.m-card { transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 240ms ease, border-color 240ms ease; }
.m-card:hover { transform: translateY(-2px); box-shadow: ${p.shadowSoft}; border-color: ${p.rule}; }
.m-nav-item { transition: background-color 160ms ease, color 160ms ease; }
.m-nav-item:hover { background-color: ${p.ink}10; }
.m-hl {
  background-image: linear-gradient(${p.highlight}, ${p.highlight});
  background-repeat: no-repeat;
  background-position: 0 88%;
  background-size: 0% 48%;
  animation: matter-highlight 900ms cubic-bezier(0.2, 0.8, 0.2, 1) 600ms forwards;
  padding: 0 2px;
}
.m-hl-peach {
  background-image: linear-gradient(${p.highlightPeach}, ${p.highlightPeach});
  background-repeat: no-repeat;
  background-position: 0 88%;
  background-size: 0% 48%;
  animation: matter-highlight 900ms cubic-bezier(0.2, 0.8, 0.2, 1) 1400ms forwards;
  padding: 0 2px;
}
.m-progress-fill { animation: matter-progress 1000ms cubic-bezier(0.2, 0.8, 0.2, 1) 200ms both; }
.m-pulse { animation: matter-pulse 2200ms ease-in-out infinite; }
.m-bar { animation: matter-bar 900ms ease-in-out infinite; transform-origin: bottom; }
.m-theme-toggle { transition: background-color 220ms ease, color 220ms ease, transform 220ms ease; }
.m-theme-toggle:hover { transform: rotate(-12deg); }

.m-d-0 { animation-delay: 0ms; }
.m-d-1 { animation-delay: 80ms; }
.m-d-2 { animation-delay: 160ms; }
.m-d-3 { animation-delay: 240ms; }
.m-d-4 { animation-delay: 320ms; }
.m-d-5 { animation-delay: 400ms; }
.m-d-6 { animation-delay: 480ms; }

@media (prefers-reduced-motion: reduce) {
  .m-fade-up, .m-fade-in, .m-slide-in, .m-hl, .m-hl-peach, .m-progress-fill, .m-pulse, .m-bar {
    animation: none !important;
  }
  .m-hl, .m-hl-peach { background-size: 100% 48%; }
}
`;

type Article = (typeof MOCK_ARTICLES)[number];

const NAV_ITEMS = [
  { label: "Queue", count: 14, icon: "▦" },
  { label: "Library", count: 217, icon: "◫" },
  { label: "Favorites", count: 9, icon: "★" },
  { label: "Highlights", count: 64, icon: "✎" },
  { label: "Archive", count: 412, icon: "⎙" },
] as const;

const COLLECTIONS = [
  { label: "Slow web", hue: "#F26A47" },
  { label: "Design systems", hue: "#4FB395" },
  { label: "Pacific history", hue: "#6E9BD9" },
  { label: "Bread", hue: "#E0B85A" },
] as const;

const STORAGE_KEY = "ril.themes.matter.mode";

export default function MatterThemePage() {
  // Default dark to match Matter's signature reading mode at night.
  const [mode, setMode] = useState<Mode>("dark");
  const [hydrated, setHydrated] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);
  const [playing, setPlaying] = useState(false);
  const [activeNav, setActiveNav] = useState<string>("Queue");

  // Hydrate persisted mode (without flashing wrong color)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") setMode(saved);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode, hydrated]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const p = mode === "dark" ? DARK : LIGHT;
  const css = useMemo(() => cssFor(p), [p]);

  const hero = MOCK_ARTICLES[0]!;
  const rest = MOCK_ARTICLES.slice(1);

  return (
    <main
      className="relative min-h-screen"
      style={{
        background: p.paper,
        color: p.ink,
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        transition: "background-color 320ms ease, color 320ms ease",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700&family=Source+Serif+4:ital,opsz,wght@0,8..60,300..700;1,8..60,300..700&display=swap"
      />
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div
        className="sticky top-0 z-20 flex items-center justify-between border-b px-8 py-3 m-fade-in"
        style={{
          borderColor: p.rule,
          background: p.topBarBg,
          backdropFilter: "saturate(140%) blur(10px)",
        }}
      >
        <Link
          href="/"
          className="text-xs tracking-wide"
          style={{ color: p.inkMute }}
        >
          ← Back to app
        </Link>
        <div className="flex items-center gap-2">
          <Logo p={p} />
          <span className="text-sm font-medium tracking-tight">Matter</span>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox p={p} />
          <ThemeToggle mode={mode} onToggle={() => setMode((m) => (m === "dark" ? "light" : "dark"))} p={p} />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1200px] grid-cols-[240px_1fr] gap-10 px-8 py-10">
        <aside className="sticky top-20 self-start m-fade-up m-d-0">
          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = activeNav === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveNav(item.label)}
                  className="m-nav-item group flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: active ? `${p.ink}12` : "transparent",
                    color: p.ink,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className="text-sm"
                      style={{ color: active ? p.accent : p.inkSoft }}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </span>
                  <span
                    className="text-xs tabular-nums"
                    style={{ color: p.inkMute }}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>

          <div
            className="mx-3 my-6 h-px"
            style={{ background: p.rule }}
          />
          <div className="flex flex-col gap-0.5">
            {COLLECTIONS.map((c) => (
              <button
                key={c.label}
                className="m-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
                style={{ color: p.inkSoft }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: c.hue }}
                />
                {c.label}
              </button>
            ))}
          </div>
        </aside>

        <section>
          <header className="mb-10 m-fade-up m-d-1">
            <h1
              className="text-4xl leading-[1.05] tracking-tight"
              style={{
                fontFamily: "'Newsreader', ui-serif, Georgia, serif",
                fontWeight: 500,
              }}
            >
              {activeNav}
            </h1>
          </header>

          <article
            onClick={() => setSelected(hero)}
            className="m-card m-fade-up m-d-2 mb-10 cursor-pointer overflow-hidden rounded-2xl border"
            style={{ borderColor: p.rule, background: p.surface }}
          >
            <div className="grid grid-cols-[1fr_200px]">
              <div className="p-7">
                <h2
                  className="text-3xl leading-[1.1] tracking-tight"
                  style={{
                    fontFamily: "'Newsreader', ui-serif, Georgia, serif",
                    fontWeight: 500,
                  }}
                >
                  {hero.title}
                </h2>
                <p
                  className="mt-3 text-[15px] leading-relaxed"
                  style={{ color: p.inkSoft }}
                >
                  {hero.excerpt}
                </p>
                <div
                  className="mt-5 flex items-center gap-2 text-xs"
                  style={{ color: p.inkMute }}
                >
                  <SourceFavicon domain={hero.domain} accent={p.accent} />
                  <span>{hero.domain}</span>
                  <span>·</span>
                  <span>{hero.readingTime} min</span>
                </div>
                <div className="mt-6">
                  <div
                    className="h-[3px] w-full overflow-hidden rounded-full"
                    style={{ background: p.paperDeep }}
                  >
                    <div
                      className="m-progress-fill h-full rounded-full"
                      style={{
                        background: p.accent,
                        ["--p" as never]: "46%",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div
                className="relative hidden md:block"
                style={{
                  background:
                    mode === "dark"
                      ? "radial-gradient(120% 120% at 20% 10%, #F2A87A 0%, #C4391A 55%, #4A1809 100%)"
                      : "radial-gradient(120% 120% at 20% 10%, #FBD9B8 0%, #E94B27 60%, #8C2F18 100%)",
                }}
              >
                <div
                  className="absolute inset-6 rounded-xl"
                  style={{
                    background:
                      mode === "dark"
                        ? "rgba(0,0,0,0.18)"
                        : "rgba(255,255,255,0.14)",
                    border:
                      mode === "dark"
                        ? "1px solid rgba(255,255,255,0.18)"
                        : "1px solid rgba(255,255,255,0.35)",
                    backdropFilter: "blur(6px)",
                  }}
                />
              </div>
            </div>
          </article>

          <div
            className="divide-y overflow-hidden rounded-2xl border m-fade-up m-d-4"
            style={{
              borderColor: p.rule,
              background: p.surface,
              // @ts-expect-error css variable for tailwind divide
              "--tw-divide-opacity": 1,
            }}
          >
            {rest.map((a, i) => (
              <QueueRow
                key={a.id}
                article={a}
                index={i}
                p={p}
                onOpen={() => setSelected(a)}
              />
            ))}
          </div>

        </section>
      </div>

      {selected && (
        <Reader
          article={selected}
          playing={playing}
          p={p}
          onTogglePlay={() => setPlaying((s) => !s)}
          onClose={() => {
            setSelected(null);
            setPlaying(false);
          }}
        />
      )}
    </main>
  );
}

function Logo({ p }: { p: Palette }) {
  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-[8px]"
      style={{ background: p.accent, color: "white" }}
    >
      <span
        className="text-[15px] font-bold leading-none"
        style={{
          fontFamily: "'Newsreader', ui-serif, Georgia, serif",
          letterSpacing: "-0.03em",
        }}
      >
        M
      </span>
    </div>
  );
}

function SearchBox({ p }: { p: Palette }) {
  const [value, setValue] = useState("");
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const expanded = hover || focus || value.length > 0;

  // Cmd/Ctrl + K focuses the input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => inputRef.current?.focus()}
      className="flex cursor-text items-center gap-2 overflow-hidden rounded-lg px-2.5 text-sm"
      style={{
        height: 34,
        width: expanded ? 280 : 36,
        background: expanded ? p.paperDeep : "transparent",
        border: `1px solid ${expanded ? p.rule : "transparent"}`,
        color: p.inkMute,
        transition:
          "width 320ms cubic-bezier(0.2, 0.8, 0.2, 1), background-color 220ms ease, border-color 220ms ease",
      }}
    >
      <span className="shrink-0 text-base leading-none">⌕</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholder="Search"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        style={{
          color: p.ink,
          opacity: expanded ? 1 : 0,
          transition: "opacity 220ms ease 80ms",
          pointerEvents: expanded ? "auto" : "none",
        }}
      />
      <span
        className="shrink-0 rounded px-1 py-0.5 text-[10px] tracking-widest"
        style={{
          border: `1px solid ${p.rule}`,
          opacity: expanded && value.length === 0 ? 1 : 0,
          transition: "opacity 180ms ease",
        }}
      >
        ⌘K
      </span>
    </div>
  );
}

function ThemeToggle({
  mode,
  onToggle,
  p,
}: {
  mode: Mode;
  onToggle: () => void;
  p: Palette;
}) {
  return (
    <button
      onClick={onToggle}
      className="m-theme-toggle flex h-9 w-9 items-center justify-center rounded-full text-base"
      style={{
        background: p.paperDeep,
        color: p.ink,
        border: `1px solid ${p.rule}`,
      }}
      aria-label={mode === "dark" ? "Switch to light" : "Switch to dark"}
      title={mode === "dark" ? "Light mode" : "Dark mode"}
    >
      {mode === "dark" ? "☀" : "☾"}
    </button>
  );
}

function SourceFavicon({
  domain,
  accent,
}: {
  domain: string;
  accent: string;
}) {
  const initial = domain.replace("www.", "").charAt(0).toUpperCase();
  const palette = [accent, "#4FB395", "#6E9BD9", "#E0B85A", "#A07AC6"];
  const hue = palette[domain.length % palette.length] ?? accent;
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] text-[9px] font-bold text-white"
      style={{ background: hue }}
    >
      {initial}
    </span>
  );
}

function QueueRow({
  article,
  index,
  p,
  onOpen,
}: {
  article: Article;
  index: number;
  p: Palette;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="m-nav-item flex w-full items-start gap-4 px-6 py-5 text-left"
      style={{ animationDelay: `${200 + index * 60}ms` }}
    >
      <div className="mt-1">
        <SourceFavicon domain={article.domain} accent={p.accent} />
      </div>
      <div className="flex-1">
        <div
          className="text-[17px] leading-snug tracking-tight"
          style={{
            fontFamily: "'Newsreader', ui-serif, Georgia, serif",
            fontWeight: 500,
            color: p.ink,
          }}
        >
          {article.title}
        </div>
        <p
          className="mt-1 line-clamp-2 text-sm leading-relaxed"
          style={{ color: p.inkSoft }}
        >
          {article.excerpt}
        </p>
        <div
          className="mt-2 flex items-center gap-2 text-[11px]"
          style={{ color: p.inkMute }}
        >
          <span>{article.domain}</span>
          <span>·</span>
          <span>{article.readingTime} min</span>
        </div>
      </div>
    </button>
  );
}

function Reader({
  article,
  playing,
  p,
  onTogglePlay,
  onClose,
}: {
  article: Article;
  playing: boolean;
  p: Palette;
  onTogglePlay: () => void;
  onClose: () => void;
}) {
  const body = useMemo(
    () =>
      article.body ?? [
        article.excerpt,
        "This preview article doesn't ship a full body in the mock dataset, but you can see how Matter's reading surface treats typography, rhythm, and generous margins around a single narrow column.",
        "Hold and drag across any sentence to highlight. Tap the play button to hand the article over to the narrator — Matter's signature feature.",
      ],
    [article],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="fixed inset-0 z-30 m-fade-in"
      style={{ background: p.scrim, backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="absolute top-0 right-0 flex h-full w-full max-w-[880px] flex-col m-slide-in"
        style={{ background: p.paper, boxShadow: p.shadowStrong }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-8 py-4"
          style={{ borderColor: p.rule }}
        >
          <button
            onClick={onClose}
            className="text-sm m-nav-item rounded-md px-2 py-1"
            style={{ color: p.inkSoft }}
          >
            ← Close
          </button>
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: p.inkMute }}
          >
            <SourceFavicon domain={article.domain} accent={p.accent} />
            {article.domain} · {article.readingTime} min
          </div>
          <div className="flex items-center gap-1">
            <ReaderIconBtn label="Aa" p={p} />
            <ReaderIconBtn label="★" p={p} />
          </div>
        </div>

        <div className="h-[2px]" style={{ background: p.paperDeep }}>
          <div
            className="h-full transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%`, background: p.accent }}
          />
        </div>

        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto px-8 pt-12 pb-36"
        >
          <div className="mx-auto max-w-[640px]">
            <h1
              className="text-[44px] leading-[1.05] tracking-tight m-fade-up"
              style={{
                fontFamily: "'Newsreader', ui-serif, Georgia, serif",
                fontWeight: 500,
              }}
            >
              {article.title}
            </h1>
            <div
              className="mt-6 text-sm m-fade-up m-d-1"
              style={{ color: p.inkMute }}
            >
              {article.author} · {article.domain}
            </div>

            <div
              className="mt-10 space-y-6 text-[19px] leading-[1.7]"
              style={{
                fontFamily:
                  "'Source Serif 4', 'Newsreader', ui-serif, Georgia, serif",
                color: p.ink,
              }}
            >
              {body.map((para, i) => {
                if (i === 1) {
                  const [head, tail] = splitOnce(para, "A feed is a river.");
                  return (
                    <p
                      key={i}
                      className="m-fade-up"
                      style={{ animationDelay: `${300 + i * 80}ms` }}
                    >
                      {head}
                      <span className="m-hl">A feed is a river.</span>
                      {tail}
                    </p>
                  );
                }
                if (article.pullQuote && para === article.pullQuote) {
                  return (
                    <blockquote
                      key={i}
                      className="m-fade-up border-l-2 py-2 pl-6 text-[22px] italic leading-[1.45]"
                      style={{
                        borderColor: p.accent,
                        color: p.inkSoft,
                        animationDelay: `${300 + i * 80}ms`,
                        fontFamily:
                          "'Newsreader', ui-serif, Georgia, serif",
                      }}
                    >
                      &ldquo;
                      <span className="m-hl-peach">{para}</span>
                      &rdquo;
                    </blockquote>
                  );
                }
                return (
                  <p
                    key={i}
                    className="m-fade-up"
                    style={{ animationDelay: `${300 + i * 80}ms` }}
                  >
                    {para}
                  </p>
                );
              })}
            </div>

          </div>
        </div>

        <div
          className="absolute right-6 bottom-6 left-6 flex items-center gap-4 rounded-2xl border px-4 py-3 m-fade-up m-d-3"
          style={{
            background: p.surface,
            borderColor: p.rule,
            boxShadow: p.shadowStrong,
          }}
        >
          <button
            onClick={onTogglePlay}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${playing ? "m-pulse" : ""}`}
            style={{ background: p.accent }}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          {playing ? (
            <div className="flex items-end gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="m-bar w-0.5 rounded-sm"
                  style={{
                    height: 18,
                    background: p.accent,
                    animationDelay: `${i * 120}ms`,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="h-4 w-2" />
          )}
          <div className="flex-1">
            <div
              className="truncate text-[13px] font-medium tracking-tight"
              style={{ color: p.ink }}
            >
              {article.title}
            </div>
            <div className="text-[11px]" style={{ color: p.inkMute }}>
              {article.readingTime} min
            </div>
          </div>
          <ReaderIconBtn label="1×" p={p} />
        </div>
      </div>
    </div>
  );
}

function ReaderIconBtn({ label, p }: { label: string; p: Palette }) {
  return (
    <button
      className="m-nav-item rounded-md px-2 py-1 text-sm"
      style={{ color: p.inkSoft }}
    >
      {label}
    </button>
  );
}

function splitOnce(text: string, needle: string): [string, string] {
  const idx = text.indexOf(needle);
  if (idx === -1) return [text, ""];
  return [text.slice(0, idx), text.slice(idx + needle.length)];
}
