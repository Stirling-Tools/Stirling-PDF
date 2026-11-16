import type { TrialSetupDetails } from "@processor/api/procurement";

/**
 * A trial setup filled in before signing in, kept so the visitor returns to their own answers
 * rather than a blank form. localStorage, not sessionStorage: confirming a new account's email
 * opens a new tab.
 */
export interface TrialDraft {
  deployment: string;
  seats: number;
  details: TrialSetupDetails;
  /** Ticked before signing in; the trial then starts on return without asking again. */
  eulaAgreed?: boolean;
}

const KEY = "stirling-enterprise-trial-draft";

/** Long enough for a confirmation email read the next morning. */
const TTL_MS = 24 * 60 * 60 * 1000;

export function saveTrialDraft(draft: TrialDraft): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ draft, at: Date.now() }));
  } catch {
    // Private browsing or a full quota: the visitor fills the form in again.
  }
}

/** Consumes the draft, so contact details do not outlive the sign-in they were kept for. */
export function takeTrialDraft(): TrialDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    if (!raw) return null;
    const { draft, at } = JSON.parse(raw) as { draft: TrialDraft; at: number };
    return Date.now() - at < TTL_MS ? draft : null;
  } catch {
    return null;
  }
}
