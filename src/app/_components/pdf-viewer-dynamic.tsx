"use client";

import dynamic from "next/dynamic";

function PdfViewerLoading() {
  return (
    <div className="flex min-h-[480px] items-center justify-center rounded-2xl border border-rule bg-surface shadow-[var(--shadow-soft)]">
      <p className="text-sm text-foreground-soft">Loading PDF viewer…</p>
    </div>
  );
}

export const PdfViewer = dynamic(
  () => import("./pdf-viewer").then((mod) => mod.PdfViewer),
  {
    ssr: false,
    loading: PdfViewerLoading,
  },
);
