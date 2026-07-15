// Whether document classification (and everything it drives in the UI: the
// Files-sidebar category grouping, per-file label chips, and the file-details
// Classification section) is active in this build. Classification is a
// SaaS-only feature gated on the AI engine, so core — and every build that
// doesn't override this seam (proprietary, desktop, cloud) — returns false, and
// none of that UI ever renders. The saas layer overrides it to track the AI
// engine's enabled flag, so the feature shows up only on SaaS when AI is on.

export function useClassificationEnabled(): boolean {
  return false;
}
