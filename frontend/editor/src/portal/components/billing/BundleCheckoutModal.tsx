import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  NumberInput,
  Skeleton,
} from "@app/ui";
import {
  BUNDLE_PIPELINE_TIERS,
  BUNDLE_POLICY_POSTURES,
  BUNDLE_SIZE_TIERS,
  type BundleQuoteBreakdown,
  computeBundleQuote,
  formatMinor,
} from "@app/billing";
import type { Wallet } from "@portal/api/billing";
import {
  acceptBundleStripeQuote,
  cancelBundleQuote,
  createBundleStripeQuote,
  fetchBundleQuotePdf,
  finalizeBundleInvoice,
  getLatestBundleQuote,
  StripeFunctionError,
  upsertBundleQuote,
  type BundleInvoice,
  type BundleQuote,
  type BundleStripeQuote,
  type LatestBundleQuote,
} from "@portal/billing/stripe";
import { PrepayModalHeader } from "@portal/components/billing/PrepayModalHeader";

/**
 * Prepaid-bundle purchase modal for the Processor billing page — "12 months for
 * the price of 10". Three steps inside the shared portal {@link Modal}:
 *
 *   1. Size your year — buyers size the purchase in PEOPLE. Team size drives an
 *      estimated volume (≈80 PDFs/user/mo), provisioned ~3× above expected; the
 *      finer settings (governance posture, file size, pipelines) scale it up. All
 *      local, via the shared {@code computeBundleQuote} brain.
 *      The calculator is the quote page: it also carries a "Download quote (PDF)"
 *      link, which (like Accept) mints the Stripe QUOTE lazily via
 *      create-payg-bundle-quote — nothing is minted just by sizing.
 *   2. Review + pay — the same quote receipt card (with "Download quote (PDF)") plus recipient details
 *      + consent. "Finalise" accepts the quote and generates the net-terms invoice, then the step flips
 *      to the finalized state (Download invoice / Pay online). Paying opens Stripe's hosted invoice;
 *      capacity lands via the webhook on invoice.paid, never here. No separate confirmation screen.
 *
 * The pool is denominated in size-folded RUNS — the same currency the meter charges
 * on consumption — so a flat per-run rate reproduces the marketing calculator's
 * total. The run-based brain (policy-count posture, pipelines, 1¢/run, 10/12) lives
 * in {@code @app/billing}, shared with the backend.
 */

/** Default team size the calculator opens on. */
const DEFAULT_USERS = 25;

/**
 * EULA version the prepay consent is recorded against (ARL/EULA §7.2). Legal owns
 * the final value + copy; placeholder until the terms are finalised. Sent to the
 * checkout edge fn as proof of what was agreed, and recorded in the session metadata.
 */
const CONSENT_EULA_VERSION = "2026-07-draft";

function policiesFor(id: string): number {
  return (
    BUNDLE_POLICY_POSTURES.find((p) => p.id === id)?.policies ??
    BUNDLE_POLICY_POSTURES[0].policies
  );
}
function sizeMultFor(id: string): number {
  return BUNDLE_SIZE_TIERS.find((s) => s.id === id)?.mult ?? 1;
}
function pipelineMultFor(id: string): number {
  return BUNDLE_PIPELINE_TIERS.find((p) => p.id === id)?.mult ?? 1;
}

// Reverse maps — resume a persisted quote (which stores the multipliers) back to the picker ids.
function postureIdFor(policies: number): string {
  return (
    BUNDLE_POLICY_POSTURES.find((p) => p.policies === policies)?.id ??
    BUNDLE_POLICY_POSTURES[0].id
  );
}
function sizeIdFor(mult: number): string {
  return (
    BUNDLE_SIZE_TIERS.find((s) => Math.abs(s.mult - mult) < 0.001)?.id ??
    BUNDLE_SIZE_TIERS[0].id
  );
}
function pipelineIdFor(mult: number): string {
  return (
    BUNDLE_PIPELINE_TIERS.find((p) => p.mult === mult)?.id ??
    BUNDLE_PIPELINE_TIERS[0].id
  );
}

/**
 * Pre-quote calculator progress, persisted per team so closing the modal / reloading doesn't lose the
 * buyer's place. Once a real quote exists it's the source of truth (loaded server-side), so this is
 * only the "still sizing, nothing minted yet" fallback.
 */
interface CalcSettings {
  users: number;
  postureId: string;
  sizeId: string;
  pipelineId: string;
  poNumber: string;
  companyName: string;
  accountName: string;
  consented: boolean;
}
function calcStorageKey(teamId: number): string {
  return `payg-bundle-calc:${teamId}`;
}
function readCalcSettings(teamId: number): CalcSettings | null {
  try {
    const raw = sessionStorage.getItem(calcStorageKey(teamId));
    if (!raw) return null;
    // Untrusted sessionStorage — coerce rather than assert, so a stale or schema-drifted blob can't
    // inject a wrong-typed `users` into the pricing arithmetic (the id fields are additionally
    // laundered by the ...IdFor() lookups downstream, but we default them here too).
    const p = JSON.parse(raw) as Partial<Record<keyof CalcSettings, unknown>>;
    const users = Number(p.users);
    return {
      users: Number.isFinite(users) && users > 0 ? users : DEFAULT_USERS,
      postureId: typeof p.postureId === "string" ? p.postureId : "governed",
      sizeId: typeof p.sizeId === "string" ? p.sizeId : "standard",
      pipelineId: typeof p.pipelineId === "string" ? p.pipelineId : "none",
      poNumber: typeof p.poNumber === "string" ? p.poNumber : "",
      companyName: typeof p.companyName === "string" ? p.companyName : "",
      accountName: typeof p.accountName === "string" ? p.accountName : "",
      consented: p.consented === true,
    };
  } catch {
    return null;
  }
}
function writeCalcSettings(teamId: number, s: CalcSettings): void {
  try {
    sessionStorage.setItem(calcStorageKey(teamId), JSON.stringify(s));
  } catch {
    // sessionStorage unavailable (private mode / quota) — progress just won't persist.
  }
}
function clearCalcSettings(teamId: number): void {
  try {
    sessionStorage.removeItem(calcStorageKey(teamId));
  } catch {
    // ignore
  }
}

/**
 * Open a URL in a new tab, falling back to same-tab navigation. A popup blocker can null the
 * {@code window.open} even from a click, and reliably does when the open follows an await (as the
 * invoice-PDF download does) — the fallback guarantees the buyer still reaches the invoice / PDF.
 * Returns true if a new tab opened, false if it fell back to navigating this tab away.
 */
function openUrl(url: string): boolean {
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) return true;
  window.location.assign(url);
  return false;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Drives teamId, per-run rate, currency, and top-up vs first-buy copy. */
  wallet: Wallet;
  /** Fired after a completed purchase so the parent can refetch the wallet. */
  onComplete?: () => void;
}

type Phase = "calc" | "pay";

export function BundleCheckoutModal({
  open,
  onClose,
  wallet,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const teamId = wallet.teamId;
  const currency = wallet.currency ?? "usd";
  const pricePerDocMinor = wallet.pricePerDocMinor;

  const [phase, setPhase] = useState<Phase>("calc");
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [postureId, setPostureId] = useState<string>("governed");
  const [sizeId, setSizeId] = useState<string>("standard");
  const [pipelineId, setPipelineId] = useState<string>("none");
  const [consented, setConsented] = useState(false);
  // Optional PO reference — stamped on the Stripe quote and carried to its invoice.
  const [poNumber, setPoNumber] = useState("");
  // Invoice recipient: company is optional (becomes the bill-to name); the account-holder name is
  // required and appears on the invoice. Both stamped at finalize alongside the PO.
  const [companyName, setCompanyName] = useState("");
  const [accountName, setAccountName] = useState("");
  // The persisted quote id, reused across edits so we drive ONE quote row (rather than spawning a new
  // one on every click). Null until first persisted (or when there's no SaaS backend).
  const [quoteId, setQuoteId] = useState<number | null>(null);
  // The Stripe quote — created LAZILY on the first Download/Accept, then reused. We deliberately do NOT
  // mint a Stripe quote just for opening the review step (a buyer tweaking the calculator would
  // otherwise leave a trail of dead quotes). Null until first minted, or when there's no SaaS backend.
  const [stripeQuote, setStripeQuote] = useState<BundleStripeQuote | null>(
    null,
  );
  // The config signature the current stripeQuote was minted for. Editing back to the calculator and
  // returning reuses that quote UNLESS this changed — so we only re-mint when the sizing/PO actually
  // differs, not on every trip through review.
  const [stripeQuoteSig, setStripeQuoteSig] = useState<string | null>(null);
  // The invoice generated when the quote is accepted (awaiting payment); null when simulated.
  const [invoice, setInvoice] = useState<BundleInvoice | null>(null);
  // On resume, the total the quote was persisted at (server value), frozen so the receipt shows what
  // the buyer actually quoted rather than a figure recomputed from a since-changed rate. Paired with
  // the pool size it was persisted at — once the buyer edits the sizing (pool changes) we drop back to
  // the live estimate, since editing re-mints and re-persists anyway.
  const [persistedPriceMinor, setPersistedPriceMinor] = useState<number | null>(
    null,
  );
  const [persistedPoolCredits, setPersistedPoolCredits] = useState<
    number | null
  >(null);
  // Accept / Download in-flight + last error, surfaced on the calculator (the quote page).
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // True while the on-open resume is in flight, so we show a loader instead of flashing the calculator
  // before it swaps to the resumed step (e.g. payment). `wasOpen` lets us flip it synchronously on the
  // open transition (below) so even the first render is the loader, not the calculator.
  const [resolving, setResolving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  // Guards the persist effect so it can't overwrite storage with defaults before hydration finishes.
  const hydratedRef = useRef(false);

  // On open: resume the team's latest OPEN quote if one exists (the server is the source of truth) —
  // reopening then continues that quote rather than minting a new one. If there's no quote yet, restore
  // pre-quote calculator progress from sessionStorage. On close: reset in-memory state (the server quote
  // and the stored progress persist for next time).
  useEffect(() => {
    if (!open) {
      hydratedRef.current = false;
      setPhase("calc");
      setUsers(DEFAULT_USERS);
      setPostureId("governed");
      setSizeId("standard");
      setPipelineId("none");
      setConsented(false);
      setPoNumber("");
      setCompanyName("");
      setAccountName("");
      setQuoteId(null);
      setStripeQuote(null);
      setStripeQuoteSig(null);
      setInvoice(null);
      setPersistedPriceMinor(null);
      setPersistedPoolCredits(null);
      setBusy(false);
      setPdfBusy(false);
      setActionError(null);
      return;
    }
    if (teamId == null) {
      hydratedRef.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      let latest: LatestBundleQuote | null;
      try {
        latest = await getLatestBundleQuote(teamId);
      } catch {
        latest = null; // no backend / not a leader — fall through to local progress
      }
      if (cancelled) return;
      const saved = readCalcSettings(teamId);
      if (latest) {
        // Resume the existing quote: restore its sizing + consent + id (landing on the calculator), and
        // relink any already-minted Stripe quote so Download/Accept reuse it rather than minting anew.
        setUsers(latest.users ?? DEFAULT_USERS);
        setPostureId(postureIdFor(latest.posturePolicies));
        setSizeId(sizeIdFor(latest.sizeMult));
        setPipelineId(pipelineIdFor(latest.pipelineMult));
        setConsented(latest.consentedAt != null);
        setQuoteId(latest.quoteId);
        setPersistedPriceMinor(latest.priceMinor);
        setPersistedPoolCredits(latest.poolCredits);
        if (saved?.poNumber) setPoNumber(saved.poNumber);
        if (saved?.companyName) setCompanyName(saved.companyName);
        if (saved?.accountName) setAccountName(saved.accountName);
        if (latest.stripeQuoteId) {
          setStripeQuote({
            stripeQuoteId: latest.stripeQuoteId,
            stripeQuoteNumber: latest.stripeQuoteNumber,
          });
          // Match the reuse signature so resuming doesn't immediately re-mint the Stripe quote.
          setStripeQuoteSig(
            `${latest.poolCredits}|${(saved?.poNumber ?? "").trim()}`,
          );
        }
        // Already accepted (an invoice exists) → resume straight to the payment step rather than the
        // calculator. acceptBundleStripeQuote is idempotent: with stripe_ref set it retrieves the
        // existing draft invoice instead of re-accepting.
        if (latest.stripeRef) {
          try {
            const inv = await acceptBundleStripeQuote({
              teamId,
              quoteId: latest.quoteId,
            });
            if (!cancelled) {
              setInvoice(inv);
              setPhase("pay");
            }
          } catch {
            // Couldn't reload the invoice; leave the buyer on the calculator (Continue re-accepts).
          }
        }
      } else if (saved) {
        setUsers(saved.users);
        setPostureId(saved.postureId);
        setSizeId(saved.sizeId);
        setPipelineId(saved.pipelineId);
        setPoNumber(saved.poNumber);
        setCompanyName(saved.companyName ?? "");
        setAccountName(saved.accountName ?? "");
        setConsented(saved.consented);
      }
      hydratedRef.current = true;
      if (!cancelled) setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, teamId]);

  // Persist pre-quote calculator progress so close/reload keeps the buyer's place. Held until hydration
  // completes so it can't clobber restored values.
  useEffect(() => {
    if (!open || teamId == null || !hydratedRef.current) return;
    writeCalcSettings(teamId, {
      users,
      postureId,
      sizeId,
      pipelineId,
      poNumber,
      companyName,
      accountName,
      consented,
    });
  }, [
    open,
    teamId,
    users,
    postureId,
    sizeId,
    pipelineId,
    poNumber,
    companyName,
    accountName,
    consented,
  ]);

  const quote = useMemo(
    () =>
      computeBundleQuote({
        users,
        posturePolicies: policiesFor(postureId),
        sizeMult: sizeMultFor(sizeId),
        pipelineMult: pipelineMultFor(pipelineId),
        ratePerRunMinor: pricePerDocMinor,
      }),
    [users, postureId, sizeId, pipelineId, pricePerDocMinor],
  );

  // The receipt shows the persisted (server) total on resume so it matches the quote the buyer
  // created, not a figure recomputed from a since-changed rate — but only while the sizing is
  // unchanged (same pool). Editing the calculator changes the pool and reverts to the live estimate.
  // savings tracks whichever total is shown so the receipt stays internally consistent.
  const receiptQuote = useMemo(() => {
    if (
      persistedPriceMinor == null ||
      persistedPoolCredits !== quote.poolCredits
    ) {
      return quote;
    }
    return {
      ...quote,
      priceMinor: persistedPriceMinor,
      savingsMinor:
        quote.listMinor != null
          ? quote.listMinor - persistedPriceMinor
          : quote.savingsMinor,
    };
  }, [quote, persistedPriceMinor, persistedPoolCredits]);

  // Flip the loader on synchronously the moment the modal opens (React's "adjust state during render"),
  // so the resume runs behind a loader from the very first frame — the calculator never shows en route to
  // a resumed payment step. The effect above clears it once the resume resolves.
  if (open !== wasOpen) {
    setWasOpen(open);
    setResolving(open && teamId != null);
  }

  if (!open || teamId == null) return null;

  // calc → pay only needs a valid pool; consent + the account-holder name are captured on the payment
  // step, so they gate the commit (accept + finalize).
  const canContinue = quote.poolCredits > 0 && !quote.overEnterprise;
  const nameProvided = accountName.trim().length > 0;
  // Once the invoice is issued, the recipient details + consent are already captured on it and the fields
  // are locked, so on resume Pay/Download just re-open the existing invoice — don't re-gate on the (now
  // read-only, possibly-unrestored) inputs, or the buttons would be permanently disabled.
  const invoiceIssued = invoice != null && invoice.status !== "draft";
  const canAccept =
    canContinue && (invoiceIssued || (consented && nameProvided));

  // Persist (create or edit) the quote row. Returns null when there's no SaaS backend
  // (Storybook/preview) — the review step then runs in a simulated state.
  async function ensureQuote(): Promise<BundleQuote | null> {
    if (teamId == null || quote.poolCredits <= 0) return null;
    try {
      const q = await upsertBundleQuote({
        teamId,
        users,
        posturePolicies: policiesFor(postureId),
        sizeMult: sizeMultFor(sizeId),
        pipelineMult: pipelineMultFor(pipelineId),
        provisionedMonthlyVolume: quote.provisionedMonthlyVolume,
        poolCredits: quote.poolCredits,
        priceMinor: quote.priceMinor,
        currency,
        consented,
        eulaVersion: CONSENT_EULA_VERSION,
        quoteId: quoteId ?? undefined,
      });
      setQuoteId(q.quoteId);
      return q;
    } catch (e) {
      if (e instanceof StripeFunctionError && e.code === "unconfigured") {
        return null; // no backend (Storybook/preview) — the flow simulates
      }
      throw e; // surfaced by the review step's error banner
    }
  }

  // Lazily create (or reuse) the Stripe quote. Called ONLY from Download / Accept — never just from
  // sizing — so tweaking the calculator never mints throwaway Stripe quotes. Reused as long as the
  // sizing/PO is unchanged (so a Download then Accept is one quote); a real change re-mints and the edge
  // fn cancels the superseded Stripe quote. Null with no SaaS backend.
  async function ensureStripeQuote(): Promise<{
    quoteId: number;
    stripeQuote: BundleStripeQuote;
  } | null> {
    if (teamId == null) return null;
    const sig = `${quote.poolCredits}|${poNumber.trim()}`;
    if (stripeQuote && stripeQuoteSig === sig && quoteId != null) {
      return { quoteId, stripeQuote }; // unchanged since last mint — reuse, no new quote
    }
    const q = await ensureQuote();
    if (!q) return null;
    const sq = await createBundleStripeQuote({
      teamId,
      quoteId: q.quoteId,
      poNumber: poNumber.trim() || undefined,
    });
    setStripeQuote(sq);
    setStripeQuoteSig(sig);
    return { quoteId: q.quoteId, stripeQuote: sq };
  }

  // Continue to payment: mint (or reuse) the Stripe quote and advance to the payment step. We deliberately
  // do NOT accept here — acceptance is the commitment and requires consent, which is captured on the
  // payment step. Deferring accept also lets the buyer go Back and re-size (accepting locks the quote).
  // No SaaS backend (Storybook/preview) → ensureStripeQuote returns null and we advance simulated.
  async function handleContinue() {
    if (!canContinue || busy || pdfBusy || teamId == null) return;
    setBusy(true);
    setActionError(null);
    try {
      await ensureStripeQuote();
      setPhase("pay");
    } catch (e) {
      if (e instanceof StripeFunctionError && e.code === "unconfigured") {
        setPhase("pay");
        return;
      }
      setActionError(e instanceof Error ? e.message : String(e)); // stays on calc
    } finally {
      setBusy(false);
    }
  }

  // Commit the purchase, shared by Download-invoice + Pay-online (both gated on consent in the UI):
  // record the pay-step consent on the quote (accept 409s without it), ACCEPT the quote to generate the
  // invoice, then finalize it (stamping any PO, which locks it). Idempotent server-side — a re-accept
  // returns the existing invoice, an already-finalized invoice comes back as-is. Returns the current
  // (simulated) invoice when there's no SaaS backend.
  async function acceptAndFinalize(): Promise<BundleInvoice | null> {
    if (teamId == null || quoteId == null) return invoice;
    await ensureQuote(); // persists consented=true (pay-step state) so accept can verify it
    await acceptBundleStripeQuote({ teamId, quoteId });
    const inv = await finalizeBundleInvoice({
      teamId,
      quoteId,
      poNumber: poNumber.trim() || undefined,
      companyName: companyName.trim() || undefined,
      accountName: accountName.trim() || undefined,
    });
    setInvoice(inv);
    return inv;
  }

  async function downloadInvoice() {
    if (busy || pdfBusy || (!invoiceIssued && (!consented || !nameProvided)))
      return;
    setPdfBusy(true);
    setActionError(null);
    try {
      const inv = await acceptAndFinalize();
      if (inv?.invoicePdf) {
        openUrl(inv.invoicePdf);
      }
    } catch (e) {
      if (e instanceof StripeFunctionError && e.code === "unconfigured") return;
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  }

  // Finalise (pre-payment): record consent + accept + finalize the invoice. Stays on the payment step —
  // the view then flips to the finalized state (Download invoice / Pay online). No hosted redirect yet.
  async function handleFinalise() {
    if (!canAccept || busy || pdfBusy) return;
    setBusy(true);
    setActionError(null);
    try {
      await acceptAndFinalize(); // sets invoice → invoiceIssued flips the view to the paid actions
    } catch (e) {
      if (e instanceof StripeFunctionError && e.code === "unconfigured") {
        // No SaaS backend (Storybook/preview) — simulate a finalized invoice so the view still flips.
        setInvoice({
          invoiceId: "sim",
          hostedInvoiceUrl: null,
          invoicePdf: null,
          status: "open",
        });
        return;
      }
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Pay online (post-finalise): open the hosted invoice, then close + let the parent refresh/poll.
  // Payment clears out of band (the invoice.paid webhook), so there's no in-modal confirmation step.
  function payOnline() {
    if (busy || pdfBusy) return;
    if (teamId != null) clearCalcSettings(teamId);
    // If the hosted invoice opened in a new tab, close the modal and let the parent poll; if a popup
    // blocker forced same-tab navigation, openUrl is already taking us to Stripe — nothing left to do.
    if (invoice?.hostedInvoiceUrl && !openUrl(invoice.hostedInvoiceUrl)) return;
    onClose();
    onComplete?.();
  }

  // Download the Stripe-rendered quote PDF. Mints the quote (if not already) — that's what makes the
  // PDF exist — then streams it. No SaaS backend → nothing to download.
  async function downloadPdf() {
    if (busy || pdfBusy || quote.poolCredits <= 0) return;
    setPdfBusy(true);
    setActionError(null);
    try {
      const ensured = await ensureStripeQuote();
      if (!ensured) return;
      const blob = await fetchBundleQuotePdf(ensured.quoteId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ensured.stripeQuote.stripeQuoteNumber ?? "stirling-quote"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof StripeFunctionError && e.code === "unconfigured") return;
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  }

  // Cancel an unpaid, already-accepted purchase and start over. Once accepted, the Stripe quote is
  // terminal (editing + re-continuing would hit quote_already_accepted), so "back" can't just re-open the
  // calculator — we void the invoice + quote server-side, then drop the accepted linkage and return to the
  // calculator. Sizing is kept so they can adjust and re-quote; consent must be given again.
  async function cancelPurchase() {
    if (teamId == null || quoteId == null || busy || pdfBusy) return;
    setBusy(true);
    setActionError(null);
    try {
      await cancelBundleQuote({ teamId, quoteId });
    } catch (e) {
      if (!(e instanceof StripeFunctionError && e.code === "unconfigured")) {
        setActionError(e instanceof Error ? e.message : String(e)); // stays on the pay step
        return;
      }
      // No SaaS backend (Storybook/preview) — nothing to void; fall through and reset locally.
    } finally {
      setBusy(false);
    }
    setInvoice(null);
    setStripeQuote(null);
    setStripeQuoteSig(null);
    setQuoteId(null);
    setConsented(false);
    setPhase("calc");
  }

  const footer =
    phase === "calc" ? (
      <div className="portal-billing__checkout-cap-actions">
        <Button variant="quiet" disabled={pdfBusy} onClick={onClose}>
          {t("portal.billing.prepaid.buy.cancel", "Cancel")}
        </Button>
        <Button
          accent="premium"
          disabled={!canContinue || pdfBusy}
          onClick={handleContinue}
          rightSection={<span aria-hidden>›</span>}
        >
          {t(
            "portal.billing.prepaid.buy.continueToPayment",
            "Continue to payment",
          )}
        </Button>
      </div>
    ) : invoiceIssued ? (
      // Finalized: the invoice exists. Cancel purchase voids + restarts; Pay online opens the hosted invoice.
      <div className="portal-billing__checkout-cap-actions">
        <Button
          variant="quiet"
          disabled={busy || pdfBusy}
          onClick={cancelPurchase}
        >
          {t("portal.billing.prepaid.buy.cancelPurchase", "Cancel purchase")}
        </Button>
        <Button accent="premium" disabled={busy || pdfBusy} onClick={payOnline}>
          {t("portal.billing.prepaid.pay.payOnline", "Pay online")}
        </Button>
      </div>
    ) : (
      // Pre-finalize: review the quote, then Finalise to issue the invoice (Back re-opens the calculator).
      <div className="portal-billing__checkout-cap-actions">
        <Button
          variant="quiet"
          disabled={busy || pdfBusy}
          onClick={() => setPhase("calc")}
        >
          {t("portal.billing.prepaid.buy.back", "Back")}
        </Button>
        <Button
          accent="premium"
          disabled={!canAccept || busy || pdfBusy}
          onClick={handleFinalise}
        >
          {t("portal.billing.prepaid.buy.finalise", "Finalise")}
        </Button>
      </div>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      className="portal-billing__bundle-modal portal-billing__checkout-modal--framed"
      ariaLabel={t(
        "portal.billing.prepaid.offer.title",
        "Get 12 months for the price of 10",
      )}
      footer={resolving ? undefined : footer}
    >
      <PrepayModalHeader
        step={resolving ? undefined : phase === "pay" ? 3 : 2}
        title={
          resolving
            ? t("portal.billing.prepaid.buy.loadingTitle", "Loading your quote")
            : phase === "pay"
              ? t("portal.billing.prepaid.buy.payTitle", "Pay for your year")
              : t(
                  "portal.billing.prepaid.buy.calcTitle",
                  "Calculate your annual payment",
                )
        }
        onClose={onClose}
      />
      <div className="portal-billing__checkout-scroll">
        {resolving && (
          <div className="portal-billing__bundle-pay" aria-busy="true">
            <Skeleton height="3rem" />
            <Skeleton height="8rem" />
            <Skeleton height="3rem" />
          </div>
        )}
        {!resolving && phase === "calc" && (
          <CalculatorStep
            users={users}
            setUsers={setUsers}
            postureId={postureId}
            setPostureId={setPostureId}
            sizeId={sizeId}
            setSizeId={setSizeId}
            pipelineId={pipelineId}
            setPipelineId={setPipelineId}
            quote={receiptQuote}
            currency={currency}
            onDownload={downloadPdf}
            downloading={pdfBusy}
            actionError={actionError}
          />
        )}
        {!resolving && phase === "pay" && (
          <PaymentStep
            quote={receiptQuote}
            currency={currency}
            onDownloadQuote={downloadPdf}
            poNumber={poNumber}
            setPoNumber={setPoNumber}
            companyName={companyName}
            setCompanyName={setCompanyName}
            accountName={accountName}
            setAccountName={setAccountName}
            consented={consented}
            setConsented={setConsented}
            poLocked={invoiceIssued}
            onDownloadInvoice={downloadInvoice}
            downloading={pdfBusy}
            actionError={actionError}
          />
        )}
      </div>
    </Modal>
  );
}

// ─── Shared: the quote receipt card ──────────────────────────────────────────
// The sized plan, its price + savings, the credit pool, and a shareable proforma download. Shown on both
// the calculator step and the payment step (so the buyer can review + download the quote before/after
// finalizing it).

function QuoteReceipt({
  quote,
  currency,
  onDownload,
  downloading,
}: {
  quote: BundleQuoteBreakdown;
  currency: string;
  /** Mint-if-needed + stream the Stripe quote PDF. */
  onDownload: () => void;
  downloading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-billing__bundle-receipt">
      <div className="portal-billing__bundle-receipt-row portal-billing__bundle-receipt-row--head">
        <span>
          {t("portal.billing.prepaid.calc.handlesLabel", "Your Processor")}
        </span>
        <strong>
          {t(
            "portal.billing.prepaid.calc.handlesValue",
            "handles {{volume}} credits / mo",
            { volume: quote.provisionedMonthlyVolume.toLocaleString() },
          )}
        </strong>
      </div>
      {quote.priceMinor != null ? (
        <>
          <div className="portal-billing__bundle-receipt-row">
            <span>
              {t(
                "portal.billing.prepaid.calc.priceLabel",
                "Your year · 12 months for the price of 10",
              )}
            </span>
            <strong className="portal-billing__bundle-receipt-price">
              {formatMinor(quote.priceMinor, currency)}
            </strong>
          </div>
          {quote.savingsMinor != null && quote.savingsMinor > 0 && (
            <p className="portal-billing__bundle-savings">
              {t(
                "portal.billing.prepaid.calc.savings",
                "You save {{amount}} · 2 months free.",
                { amount: formatMinor(quote.savingsMinor, currency) },
              )}
            </p>
          )}
        </>
      ) : (
        <p className="portal-billing__bundle-savings">
          {t(
            "portal.billing.prepaid.calc.rateUnknown",
            "We'll show the exact price at checkout.",
          )}
        </p>
      )}
      {quote.poolCredits > 0 && (
        <p className="portal-billing__bundle-pool">
          {t(
            "portal.billing.prepaid.calc.poolCaption",
            "One pool of {{credits}} credits for the year. Heavy months borrow from light ones.",
            { credits: quote.poolCredits.toLocaleString() },
          )}
        </p>
      )}
      {quote.poolCredits > 0 && (
        <div
          role="button"
          tabIndex={0}
          aria-disabled={downloading}
          className="portal-billing__bundle-download"
          onClick={onDownload}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onDownload();
            }
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
          </svg>
          {downloading
            ? t("portal.billing.prepaid.review.downloading", "Preparing…")
            : t(
                "portal.billing.prepaid.review.download",
                "Download quote (PDF)",
              )}
          {!downloading && (
            <span className="portal-billing__bundle-download-share">
              · {t("portal.billing.prepaid.review.share", "share for approval")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 1: users-first calculator ──────────────────────────────────────────

interface CalcProps {
  users: number;
  setUsers: (v: number) => void;
  postureId: string;
  setPostureId: (v: string) => void;
  sizeId: string;
  setSizeId: (v: string) => void;
  pipelineId: string;
  setPipelineId: (v: string) => void;
  quote: BundleQuoteBreakdown;
  currency: string;
  /** Mint-if-needed + stream the Stripe quote PDF. */
  onDownload: () => void;
  /** PDF download in flight. */
  downloading: boolean;
  /** Last Download error, surfaced inline. */
  actionError: string | null;
}

interface PickerCard {
  id: string;
  title: string;
  meta?: string;
  desc: string;
}

function CalculatorStep({
  users,
  setUsers,
  postureId,
  setPostureId,
  sizeId,
  setSizeId,
  pipelineId,
  setPipelineId,
  quote,
  currency,
  onDownload,
  downloading,
  actionError,
}: CalcProps) {
  const { t } = useTranslation();
  // Deployment is a display-only finer setting (same rate self-serve); expanded
  // tracks which row's card picker is bloomed (demo: one open at a time).
  const [deployId, setDeployId] = useState<string>("cloud");
  const [expanded, setExpanded] = useState<string | null>(null);

  const deployCards: PickerCard[] = [
    {
      id: "cloud",
      title: t("portal.billing.prepaid.deploy.cloud", "Stirling Cloud"),
      desc: t(
        "portal.billing.prepaid.deploy.cloudDesc",
        "Managed by Stirling. Live in minutes.",
      ),
    },
    {
      id: "selfhost",
      title: t("portal.billing.prepaid.deploy.selfhost", "Self-hosted"),
      desc: t(
        "portal.billing.prepaid.deploy.selfhostDesc",
        "Runs on private infrastructure. Same rate.",
      ),
    },
  ];
  const sizeCards: PickerCard[] = [
    {
      id: "compact",
      title: t("portal.billing.prepaid.size.compact", "Compact"),
      meta: "×1",
      desc: t(
        "portal.billing.prepaid.size.compactDesc",
        "Files under 25 MB, no data charges",
      ),
    },
    {
      id: "standard",
      title: t("portal.billing.prepaid.size.standard", "Standard"),
      meta: "×1.2",
      desc: t(
        "portal.billing.prepaid.size.standardDesc",
        "Mostly small, some scans past 25 MB",
      ),
    },
    {
      id: "heavy",
      title: t("portal.billing.prepaid.size.heavy", "Heavy"),
      meta: "×2",
      desc: t(
        "portal.billing.prepaid.size.heavyDesc",
        "Scanned or image-heavy, routinely 50 MB+",
      ),
    },
  ];
  const postureCards: PickerCard[] = [
    {
      id: "essentials",
      title: t("portal.billing.prepaid.posture.essentials", "Essentials"),
      meta: t(
        "portal.billing.prepaid.calc.policiesMeta",
        "{{count}} policies",
        {
          count: 2,
        },
      ),
      desc: t(
        "portal.billing.prepaid.posture.essentialsDesc",
        "Classification, the default, plus Sharing",
      ),
    },
    {
      id: "governed",
      title: t("portal.billing.prepaid.posture.governed", "Governed"),
      meta: t(
        "portal.billing.prepaid.calc.policiesMeta",
        "{{count}} policies",
        {
          count: 4,
        },
      ),
      desc: t(
        "portal.billing.prepaid.posture.governedDesc",
        "Adds Security and Routing",
      ),
    },
    {
      id: "regulated",
      title: t("portal.billing.prepaid.posture.regulated", "Regulated"),
      meta: t(
        "portal.billing.prepaid.calc.policiesMeta",
        "{{count}} policies",
        {
          count: 7,
        },
      ),
      desc: t(
        "portal.billing.prepaid.posture.regulatedDesc",
        "Every category, incl. Compliance, Retention, Ingestion",
      ),
    },
  ];
  const pipelineCards: PickerCard[] = [
    {
      id: "none",
      title: t("portal.billing.prepaid.pipelines.none", "None"),
      desc: t(
        "portal.billing.prepaid.pipelines.noneDesc",
        "Not running pipelines yet. Turn them on any time.",
      ),
    },
    {
      id: "standard",
      title: t("portal.billing.prepaid.pipelines.standard", "Standard"),
      desc: t(
        "portal.billing.prepaid.pipelines.standardDesc",
        "A few pipelines re-process arriving PDFs.",
      ),
    },
    {
      id: "advanced",
      title: t("portal.billing.prepaid.pipelines.advanced", "Advanced"),
      desc: t(
        "portal.billing.prepaid.pipelines.advancedDesc",
        "Pipelines drive most of your processing.",
      ),
    },
  ];

  const find = (cards: PickerCard[], id: string) =>
    cards.find((c) => c.id === id) ?? cards[0];
  const size = find(sizeCards, sizeId);
  const posture = find(postureCards, postureId);
  const pipeline = find(pipelineCards, pipelineId);
  const policies =
    BUNDLE_POLICY_POSTURES.find((p) => p.id === postureId)?.policies ?? 0;

  const deployValue =
    deployId === "cloud"
      ? t(
          "portal.billing.prepaid.deploy.cloudValue",
          "Stirling Cloud · Managed",
        )
      : t(
          "portal.billing.prepaid.deploy.selfhostValue",
          "Self-hosted · Private infrastructure",
        );
  const sizeValue = t(
    "portal.billing.prepaid.calc.sizingValue",
    "{{label}} · {{desc}}",
    { label: size.title, desc: size.desc },
  );
  const postureValue = t(
    "portal.billing.prepaid.calc.governanceValue",
    "{{label}} · {{count}} policies",
    { label: posture.title, count: policies },
  );

  const rows = [
    {
      id: "deploy",
      label: t("portal.billing.prepaid.calc.deployRow", "Deployment"),
      value: deployValue,
      cards: deployCards,
      activeId: deployId,
      onPick: setDeployId,
    },
    {
      id: "size",
      label: t("portal.billing.prepaid.calc.sizingRow", "Sizing"),
      value: sizeValue,
      cards: sizeCards,
      activeId: sizeId,
      onPick: setSizeId,
    },
    {
      id: "posture",
      label: t("portal.billing.prepaid.calc.governanceRow", "Governance"),
      value: postureValue,
      cards: postureCards,
      activeId: postureId,
      onPick: setPostureId,
    },
    {
      id: "pipes",
      label: t("portal.billing.prepaid.calc.pipelinesLabel", "Pipelines"),
      value: pipeline.title,
      cards: pipelineCards,
      activeId: pipelineId,
      onPick: setPipelineId,
    },
  ];

  return (
    <div className="portal-billing__bundle-calc">
      {actionError && (
        <Banner
          tone="danger"
          title={t(
            "portal.billing.prepaid.buy.invoiceErrorTitle",
            "Couldn't generate the invoice",
          )}
        >
          {actionError}
        </Banner>
      )}
      <div className="portal-billing__bundle-field">
        <div className="portal-billing__bundle-field-label">
          {t("portal.billing.prepaid.calc.usersLabel", "Total users")}
        </div>
        <div className="portal-billing__bundle-users">
          <NumberInput
            value={users}
            onChange={(v) => setUsers(typeof v === "number" ? v : 0)}
            min={0}
            step={1}
            allowNegative={false}
            aria-label={t(
              "portal.billing.prepaid.calc.usersLabel",
              "Total users",
            )}
          />
        </div>
      </div>

      {/* Finer settings as progressive-disclosure rows — a "Change" blooms the card picker. */}
      <div className="portal-billing__bundle-rows">
        {rows.map((row) => {
          const open = expanded === row.id;
          return (
            <div key={row.id} className="portal-billing__bundle-row">
              <div
                role="button"
                tabIndex={0}
                className="portal-billing__bundle-row-head"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpanded(open ? null : row.id);
                  }
                }}
              >
                <span className="portal-billing__bundle-row-label">
                  {row.label}
                </span>
                <span className="portal-billing__bundle-row-value">
                  {row.value}
                  <span className="portal-billing__bundle-row-change">
                    {open
                      ? t("portal.billing.prepaid.calc.done", "Done")
                      : t("portal.billing.prepaid.calc.change", "Change")}
                  </span>
                </span>
              </div>
              {open && (
                <div className="portal-billing__bundle-row-body">
                  <div className="portal-billing__bundle-cards">
                    {row.cards.map((card) => {
                      const active = card.id === row.activeId;
                      const pick = () => {
                        row.onPick(card.id);
                        setExpanded(null);
                      };
                      return (
                        <div
                          key={card.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={active}
                          className={
                            "portal-billing__bundle-card" +
                            (active
                              ? " portal-billing__bundle-card--active"
                              : "")
                          }
                          onClick={pick}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              pick();
                            }
                          }}
                        >
                          <span className="portal-billing__bundle-card-head">
                            <span className="portal-billing__bundle-card-title">
                              {card.title}
                            </span>
                            {card.meta && (
                              <span className="portal-billing__bundle-card-meta">
                                {card.meta}
                              </span>
                            )}
                          </span>
                          <span className="portal-billing__bundle-card-desc">
                            {card.desc}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Receipt — the sized plan, its price, the credit pool, and a shareable proforma. */}
      <QuoteReceipt
        quote={quote}
        currency={currency}
        onDownload={onDownload}
        downloading={downloading}
      />

      {quote.overEnterprise && (
        <p className="portal-billing__bundle-savings">
          {t(
            "portal.billing.prepaid.calc.enterpriseHint",
            "This is enterprise scale. At this volume, enterprise rates beat any self-serve discount. Rate lock, terms, and a quote in minutes.",
          )}
        </p>
      )}
    </div>
  );
}

// ─── Step 2: pay for your year (quote already accepted → PO · download · pay) ──

function PaymentStep({
  quote,
  currency,
  onDownloadQuote,
  poNumber,
  setPoNumber,
  companyName,
  setCompanyName,
  accountName,
  setAccountName,
  consented,
  setConsented,
  poLocked,
  onDownloadInvoice,
  downloading,
  actionError,
}: {
  quote: BundleQuoteBreakdown;
  currency: string;
  /** Mint-if-needed + stream the Stripe quote PDF (the receipt card's download link). */
  onDownloadQuote: () => void;
  poNumber: string;
  setPoNumber: (v: string) => void;
  companyName: string;
  setCompanyName: (v: string) => void;
  accountName: string;
  setAccountName: (v: string) => void;
  consented: boolean;
  setConsented: (v: boolean) => void;
  /** True once the invoice is finalized (first Download/Pay) — recipient fields + consent lock. */
  poLocked: boolean;
  /** Finalize + open the invoice PDF. */
  onDownloadInvoice: () => void;
  downloading: boolean;
  actionError: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-billing__bundle-pay">
      {actionError && (
        <Banner
          tone="danger"
          title={t(
            "portal.billing.prepaid.buy.invoiceErrorTitle",
            "Couldn't generate the invoice",
          )}
        >
          {actionError}
        </Banner>
      )}
      <QuoteReceipt
        quote={quote}
        currency={currency}
        onDownload={onDownloadQuote}
        downloading={downloading}
      />
      {/* Recipient + PO capture. Hidden once the invoice is issued: locked onto the invoice and we don't
          hold the values to re-display, so empty disabled inputs would just read as broken. Company + PO
          share a row to keep the step compact. */}
      {!poLocked && (
        <div className="portal-billing__bundle-fields">
          <FormField
            label={t(
              "portal.billing.prepaid.pay.accountName",
              "Account holder name",
            )}
            required
          >
            <Input
              inputSize="sm"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder={t(
                "portal.billing.prepaid.pay.accountNamePlaceholder",
                "e.g. Jane Smith",
              )}
            />
          </FormField>
          <div className="portal-billing__bundle-field-row">
            <FormField
              label={t(
                "portal.billing.prepaid.pay.companyName",
                "Company name (optional)",
              )}
            >
              <Input
                inputSize="sm"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t(
                  "portal.billing.prepaid.pay.companyNamePlaceholder",
                  "e.g. Acme Inc.",
                )}
              />
            </FormField>
            <FormField
              label={t(
                "portal.billing.prepaid.pay.poNumber",
                "PO number (optional)",
              )}
            >
              <Input
                inputSize="sm"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder={t(
                  "portal.billing.prepaid.pay.poNumberPlaceholder",
                  "e.g. PO-2026-0142",
                )}
              />
            </FormField>
          </div>
        </div>
      )}
      {/* Consent (pre-finalize only): acknowledges that once the prepaid pool is used up / expires,
          metered pay-as-you-go continues (up to the spend limit) unless cancelled — no annual auto-renewal
          is claimed, since the bundle isn't a subscription. Hidden once the invoice is issued: it's locked
          and already recorded, so a disabled checkbox just adds noise. Legal owns the wording. */}
      {!poLocked && (
        <div className="portal-billing__bundle-consent">
          <Checkbox
            checked={consented}
            onChange={(e) => setConsented(e.currentTarget.checked)}
            label={t(
              "portal.billing.prepaid.consent.label",
              "I understand that when my prepaid capacity is used up or expires after 12 months, processing automatically continues at the standard metered pay-as-you-go rate (up to my spend limit) unless I cancel, and that I can cancel anytime from the billing portal.",
            )}
          />
        </div>
      )}
      {/* Download invoice appears once the invoice is finalized (its PDF exists). Pre-finalize, the
          receipt card's "Download quote (PDF)" is the shareable document. */}
      {poLocked && (
        <div className="portal-billing__bundle-foot-end">
          <Button
            variant="quiet"
            disabled={downloading}
            onClick={onDownloadInvoice}
          >
            {downloading
              ? t("portal.billing.prepaid.review.downloading", "Preparing…")
              : t(
                  "portal.billing.prepaid.pay.downloadInvoice",
                  "Download invoice",
                )}
          </Button>
        </div>
      )}
    </div>
  );
}
