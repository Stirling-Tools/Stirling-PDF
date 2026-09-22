import React, { Suspense, lazy } from "react";

// react-markdown + remark-gfm + micromark are ~120 KB gz and only render when
// a markdown document is open (viewer) or a chat message arrives, so the heavy
// module lives in its own chunk and callers keep the synchronous signature.
const MarkdownRendererImpl = lazy(
  () => import("@app/components/viewer/nonpdf/MarkdownRendererImpl"),
);

/** Renders markdown; while the renderer chunk loads, the raw text shows. */
export function renderMarkdown(content: string): React.ReactNode[] {
  return [
    <Suspense
      key="md"
      fallback={<div style={{ whiteSpace: "pre-wrap" }}>{content}</div>}
    >
      <MarkdownRendererImpl content={content} />
    </Suspense>,
  ];
}
