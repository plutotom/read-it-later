"use client";

import dynamic from "next/dynamic";

function PdfViewerLoading() {
  return (
    <div className="border-rule bg-surface flex min-h-[480px] items-center justify-center rounded-2xl border shadow-[var(--shadow-soft)]">
      <p className="text-foreground-soft text-sm">Loading PDF viewer…</p>
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
