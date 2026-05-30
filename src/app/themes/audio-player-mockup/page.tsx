"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MOCK_ARTICLES } from "../_data/mock-articles";
import { ExpandedSheet } from "./_components/expanded-sheet";
import { VARIANT_LABELS } from "./_components/expanded-variants";
import { MiniPlayerMock } from "./_components/mini-player-mock";
import { MATTER_DARK as p } from "./_components/palette";
import type { ExpandedVariant } from "./_components/types";

const MOCK_DURATION = 447; // 7:27
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const article = MOCK_ARTICLES[0]!;

export default function AudioPlayerMockupPage() {
  const [variant, setVariant] = useState<ExpandedVariant>("classic");
  const [playerMode, setPlayerMode] = useState<"idle" | "playing">("playing");
  const [expanded, setExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(151); // 2:31
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Demo: advance time while “playing”
  useEffect(() => {
    if (!isPlaying || !expanded) return;
    const id = setInterval(() => {
      setCurrentTime((t) => (t >= MOCK_DURATION ? 0 : t + 0.5));
    }, 500);
    return () => clearInterval(id);
  }, [isPlaying, expanded]);

  const cycleSpeed = useCallback(() => {
    setPlaybackSpeed((s) => {
      const i = SPEEDS.indexOf(s as (typeof SPEEDS)[number]);
      return SPEEDS[(i + 1) % SPEEDS.length] ?? 1;
    });
  }, []);

  const playback = {
    currentTime,
    duration: MOCK_DURATION,
    isPlaying,
    playbackSpeed,
  };

  const mockArticle = {
    title: article.title,
    domain: article.domain,
    author: article.author,
    readingTime: article.readingTime,
  };

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: p.paper, color: p.ink }}
    >
      {/* Page chrome (outside phone) */}
      <header
        className="border-b px-4 py-6 sm:px-8"
        style={{ borderColor: p.rule, background: p.paperDeep }}
      >
        <div className="mx-auto max-w-4xl">
          <Link
            href="/themes/matter"
            className="text-[12px] hover:underline"
            style={{ color: p.inkMute }}
          >
            ← Matter theme
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Expanded audio player — visual mockups
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed" style={{ color: p.inkSoft }}>
            Mobile-first preview. Tap the <strong style={{ color: p.ink }}>center of the mini bar</strong> (not play or speed) to open the sheet.
            Switch variants below the phone to compare layouts — nothing is wired to real audio yet.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {(Object.keys(VARIANT_LABELS) as ExpandedVariant[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setVariant(key)}
                className="rounded-full border px-4 py-2 text-[13px] font-medium transition-colors"
                style={{
                  borderColor: variant === key ? p.accent : p.rule,
                  background: variant === key ? `${p.accent}22` : "transparent",
                  color: variant === key ? p.ink : p.inkSoft,
                }}
              >
                {VARIANT_LABELS[key].title}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px]" style={{ color: p.inkMute }}>
            {VARIANT_LABELS[variant].blurb}
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-[12px]">
            <label className="flex items-center gap-2" style={{ color: p.inkSoft }}>
              <input
                type="checkbox"
                checked={playerMode === "playing"}
                onChange={(e) =>
                  setPlayerMode(e.target.checked ? "playing" : "idle")
                }
                className="rounded border"
              />
              Show playing mini bar (vs generate state)
            </label>
          </div>
        </div>
      </header>

      <main className="flex justify-center px-4 py-10 sm:px-8">
        {/* Phone frame */}
        <div
          className="relative w-full max-w-[390px] overflow-hidden rounded-[44px] border-[10px] shadow-2xl"
          style={{
            borderColor: "#0a0908",
            background: p.paper,
            height: "min(844px, calc(100vh - 280px))",
            minHeight: 640,
          }}
        >
          {/* Status bar hint */}
          <div
            className="flex h-11 shrink-0 items-end justify-center pb-1 text-[11px] tabular-nums"
            style={{ color: p.inkMute }}
          >
            9:41
          </div>

          {/* Article scroll area */}
          <div className="relative h-[calc(100%-11rem)] overflow-y-auto px-6 pb-4">
            <p
              className="text-[11px] font-medium uppercase tracking-widest"
              style={{ color: p.inkMute }}
            >
              {article.domain}
            </p>
            <h2
              className="mt-2 font-serif text-[26px] leading-snug"
              style={{ color: p.ink }}
            >
              {article.title}
            </h2>
            <div className="mt-6 space-y-4 font-serif text-[17px] leading-[1.65]" style={{ color: p.inkSoft }}>
              {(article.body ?? [article.excerpt]).slice(0, 5).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>

          {/* Mini player dock */}
          <div
            className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
            style={{
              background: `linear-gradient(transparent, ${p.paper} 40%)`,
            }}
          >
            <MiniPlayerMock
              mode={playerMode}
              playback={playback}
              onBodyClick={() => setExpanded(true)}
              onPlayClick={(e) => {
                e.stopPropagation();
                if (playerMode === "idle") {
                  setPlayerMode("playing");
                } else {
                  setIsPlaying((v) => !v);
                }
              }}
              onSpeedClick={(e) => {
                e.stopPropagation();
                cycleSpeed();
              }}
            />
            <p
              className="mt-2 text-center text-[10px]"
              style={{ color: p.inkMute }}
            >
              Tap title area to expand
            </p>
          </div>

          <ExpandedSheet
            open={expanded}
            variant={variant}
            article={mockArticle}
            playback={playback}
            onClose={() => setExpanded(false)}
            onSeek={setCurrentTime}
            onTogglePlay={() => setIsPlaying((v) => !v)}
            onCycleSpeed={cycleSpeed}
          />
        </div>
      </main>
    </div>
  );
}
