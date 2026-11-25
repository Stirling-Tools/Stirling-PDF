import { useSyncExternalStore } from "react";
import { onEmbeddedFaceLoaded } from "@editor/tools/pdfTextEditor/util/embeddedFace";
import { resetTextMetricsCache } from "@editor/tools/pdfTextEditor/util/textMetrics";

let epoch = 0;
const subscribers = new Set<() => void>();
let stopWatching: (() => void) | null = null;

function fontsChanged(): void {
  resetTextMetricsCache();
  epoch++;
  for (const notify of [...subscribers]) notify();
}

// One watcher for every overlay: each reading `document.fonts.ready` and clearing the metrics cache for itself took most of a minute to open a page of 10,000 runs.
function watchFonts(): () => void {
  const stopFaces = onEmbeddedFaceLoaded(fontsChanged);
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts) return stopFaces;
  let watching = true;
  if (fonts.status === "loading")
    void fonts.ready.then(() => {
      if (watching) fontsChanged();
    });
  fonts.addEventListener("loadingdone", fontsChanged);
  return () => {
    watching = false;
    stopFaces();
    fonts.removeEventListener("loadingdone", fontsChanged);
  };
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  stopWatching ??= watchFonts();
  return () => {
    subscribers.delete(notify);
    if (subscribers.size > 0) return;
    stopWatching?.();
    stopWatching = null;
  };
}

const currentEpoch = () => epoch;

/**
 * Counts the times the fonts text is measured in have changed: a document or
 * embedded face finishing loading. The text-metrics cache is already cleared
 * when the count moves, once for every subscriber, so a measurement memoised
 * on it is redone against the new faces.
 */
export function useFontEpoch(): number {
  return useSyncExternalStore(subscribe, currentEpoch, currentEpoch);
}
