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
  Select,
  Skeleton,
} from "@app/ui";
import {
  BUNDLE_PIPELINE_TIERS,
  BUNDLE_POLICY_POSTURES,
  BUNDLE_SIZE_TIERS,
  type BundleQuoteBreakdown,
  computeBundleQuote,
  bundleListMinor,
  bundlePriceMinor,
  formatMinor,
  formatMoneyMajor,
  currencySymbol,
} from "@app/billing";
import type { Wallet } from "@app/portal/api/billing";
import { stripeMinorUnitScale } from "@app/utils/stripeCurrency";
import {
  acceptBundleStripeQuote,
  cancelBundleQuote,
  createBundleStripeQuote,
  fetchBundleQuotePdf,
  fetchBundlePricing,
  type BundlePricing,
  finalizeBundleInvoice,
  getLatestBundleQuote,
  StripeFunctionError,
  upsertBundleQuote,
  type BundleInvoice,
  type BundleQuote,
  type BundleStripeQuote,
} from "@app/portal/billing/stripe";
import "@app/portal/theme/surface.css";

const DEFAULT_POOL_CREDITS = 1_200_000;
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
 * Reuse key for the minted Stripe quote. Includes the sizing MULTIPLIER ids alongside the pool + PO,
 * not just the pool: different posture/size/pipeline combos can yield the same poolCredits (identical
 * Stripe amount), and keying on the pool alone would skip the re-mint on such an edit and leave the
 * persisted quote row with stale sizing fields. Keying on the ids re-mints (and re-persists) whenever
 * the buyer actually changes the config.
 */
function buildStripeQuoteSig(
  poolCredits: number,
  postureId: string,
  sizeId: string,
  pipelineId: string,
  poNumber: string,
): string {
  return `${poolCredits}|${postureId}|${sizeId}|${pipelineId}|${poNumber.trim()}`;
}

/**
 * Pre-quote calculator progress, persisted per team so closing the modal / reloading doesn't lose the
 * buyer's place. Once a real quote exists it's the source of truth (loaded server-side), so this is
 * only the "still sizing, nothing minted yet" fallback.
 */
interface CalcSettings {
  poolCredits: number;
  users: number | null;
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
    const legacy = computeBundleQuote({
      users: Number.isFinite(users) && users > 0 ? users : DEFAULT_USERS,
      posturePolicies: policiesFor(
        typeof p.postureId === "string" ? p.postureId : "governed",
      ),
      sizeMult: sizeMultFor(
        typeof p.sizeId === "string" ? p.sizeId : "standard",
      ),
      pipelineMult: pipelineMultFor(
        typeof p.pipelineId === "string" ? p.pipelineId : "none",
      ),
      ratePerRunMinor: null,
    });
    const poolCredits = Number(p.poolCredits);
    return {
      poolCredits:
        Number.isSafeInteger(poolCredits) && poolCredits > 0
          ? poolCredits
          : legacy.poolCredits,
      users:
        p.users == null
          ? null
          : Number.isFinite(users) && users > 0
            ? users
            : DEFAULT_USERS,
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
  /** Return to payment choices without cancelling the saved quote; omitted for top-ups. */
  onBack?: () => void;
  /** Identifies the team and whether this is a top-up. Stripe supplies pricing. */
  wallet: Wallet;
  /** Fired after a completed purchase so the parent can refetch the wallet. */
  onComplete?: () => void;
}

type Phase = "calc" | "pay";

export function BundleCheckoutModal({
  open,
  onClose,
  onBack,
  wallet,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const teamId = wallet.teamId;
  const [pricing, setPricing] = useState<BundlePricing | null>(null);
  const pricingRequest = useRef(0);
  const [persistedSubtotal, setPersistedSubtotal] = useState<number | null>(
    null,
  );
  // The pool is priced per size-scaled RUN at the prepaid-bundle rate (bundle:processor), NOT the
  // metered per-document rate — so the estimate matches the amount the checkout edge fn charges.
  const ratePerRunMinor = pricing?.unitAmountMinor ?? null;

  const [phase, setPhase] = useState<Phase>("calc");
  const [poolCredits, setPoolCredits] = useState(DEFAULT_POOL_CREDITS);
  const [users, setUsers] = useState<number | null>(null);
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
  // On resume, the total the quote was persisted at, frozen so the receipt shows what the buyer
  // actually quoted rather than a figure recomputed from a since-changed rate. Once the Stripe quote
  // has been minted this is the server-derived total (create-payg-bundle-quote overwrites price_minor
  // with Price x qty - amount_off); before that it's the client estimate persisted at upsert. Paired
  // with the pool size it was persisted at — once the buyer edits the sizing (pool changes) we drop
  // back to the live estimate, since editing re-mints and re-persists anyway.
  const [persistedPriceMinor, setPersistedPriceMinor] = useState<number | null>(
    null,
  );
  const [persistedCurrency, setPersistedCurrency] = useState<string | null>(
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
      setPoolCredits(DEFAULT_POOL_CREDITS);
      setUsers(null);
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
      setPersistedCurrency(null);
      setPersistedSubtotal(null);
      setPricing(null);
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
      const [pricingResult, quoteResult] = await Promise.allSettled([
        fetchBundlePricing(teamId),
        getLatestBundleQuote(teamId),
      ]);
      if (cancelled) return;
      const latest =
        quoteResult.status === "fulfilled" ? quoteResult.value : null;
      let resolvedPricing =
        pricingResult.status === "fulfilled" ? pricingResult.value : null;
      if (
        latest?.currency &&
        resolvedPricing?.currencyLocked === false &&
        latest.currency !== resolvedPricing.currency &&
        resolvedPricing.availableCurrencies.includes(latest.currency)
      ) {
        try {
          resolvedPricing = await fetchBundlePricing(teamId, latest.currency);
        } catch (error) {
          resolvedPricing = null;
          if (!cancelled)
            setActionError(
              error instanceof Error ? error.message : String(error),
            );
        }
        if (cancelled) return;
      }
      setPricing(resolvedPricing);
      if (pricingResult.status === "rejected" && !latest?.stripeRef) {
        const error = pricingResult.reason;
        setActionError(error instanceof Error ? error.message : String(error));
      }
      const saved = readCalcSettings(teamId);
      if (latest) {
        // Resume the existing quote: restore its sizing + consent + id (landing on the calculator), and
        // relink any already-minted Stripe quote so Download/Accept reuse it rather than minting anew.
        setPoolCredits(latest.poolCredits);
        setUsers(latest.users);
        setPostureId(postureIdFor(latest.posturePolicies));
        setSizeId(sizeIdFor(latest.sizeMult));
        setPipelineId(pipelineIdFor(latest.pipelineMult));
        setConsented(latest.consentedAt != null);
        setQuoteId(latest.quoteId);
        const sameCurrency = latest.currency === resolvedPricing?.currency;
        setPersistedPriceMinor(
          (sameCurrency && latest.stripeQuoteId) || latest.stripeRef
            ? latest.priceMinor
            : null,
        );
        setPersistedCurrency(latest.currency);
        setPersistedPoolCredits(latest.poolCredits);
        if (saved?.poNumber) setPoNumber(saved.poNumber);
        if (saved?.companyName) setCompanyName(saved.companyName);
        if (saved?.accountName) setAccountName(saved.accountName);
        if (latest.stripeQuoteId && (sameCurrency || latest.stripeRef)) {
          setStripeQuote({
            stripeQuoteId: latest.stripeQuoteId,
            stripeQuoteNumber: latest.stripeQuoteNumber,
          });
          // Match the reuse signature so resuming doesn't immediately re-mint the Stripe quote.
          setStripeQuoteSig(
            buildStripeQuoteSig(
              latest.poolCredits,
              postureIdFor(latest.posturePolicies),
              sizeIdFor(latest.sizeMult),
              pipelineIdFor(latest.pipelineMult),
              saved?.poNumber ?? "",
            ),
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
        setPoolCredits(saved.poolCredits);
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
      pricingRequest.current += 1;
    };
  }, [open, teamId]);

  async function changeCurrency(selected: string) {
    if (
      teamId == null ||
      pricing?.currencyLocked !== false ||
      busy ||
      pdfBusy ||
      invoice
    )
      return;
    const request = ++pricingRequest.current;
    setBusy(true);
    setActionError(null);
    try {
      const next = await fetchBundlePricing(teamId, selected);
      if (request !== pricingRequest.current) return;
      setPricing(next);
      setPersistedPriceMinor(null);
      setPersistedCurrency(null);
      setPersistedSubtotal(null);
      setStripeQuote(null);
      setStripeQuoteSig(null);
    } catch (error) {
      if (request === pricingRequest.current) {
        setActionError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (request === pricingRequest.current) setBusy(false);
    }
  }

  // Persist pre-quote calculator progress so close/reload keeps the buyer's place. Held until hydration
  // completes so it can't clobber restored values.
  useEffect(() => {
    if (!open || teamId == null || !hydratedRef.current) return;
    writeCalcSettings(teamId, {
      poolCredits,
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
    poolCredits,
    users,
    postureId,
    sizeId,
    pipelineId,
    poNumber,
    companyName,
    accountName,
    consented,
  ]);

  const quote = useMemo<BundleQuoteBreakdown>(() => {
    const listMinor = bundleListMinor(poolCredits, ratePerRunMinor);
    const priceMinor = bundlePriceMinor(poolCredits, ratePerRunMinor);
    return {
      expectedMonthlyVolume: Math.round(poolCredits / 12),
      provisionedMonthlyVolume: Math.round(poolCredits / 12),
      poolCredits,
      listMinor,
      priceMinor,
      savingsMinor:
        listMinor != null && priceMinor != null ? listMinor - priceMinor : null,
      overEnterprise: false,
    };
  }, [poolCredits, ratePerRunMinor]);

  const currency =
    persistedPriceMinor != null && persistedPoolCredits === quote.poolCredits
      ? (persistedCurrency ?? pricing?.currency ?? "usd")
      : (pricing?.currency ?? "usd");

  function changePool(credits: number) {
    const next = Number.isSafeInteger(credits) && credits > 0 ? credits : 0;
    if (next === poolCredits) return;
    setStripeQuoteSig(null);
    setPersistedPriceMinor(null);
    setPersistedPoolCredits(null);
    setPersistedCurrency(null);
    setPersistedSubtotal(null);
    setPoolCredits(next);
    setUsers(null);
    setPostureId("essentials");
    setSizeId("compact");
    setPipelineId("none");
  }

  // A resumed quote keeps its agreed total; its original undiscounted rate is not persisted.
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
      listMinor: persistedSubtotal,
      savingsMinor:
        persistedSubtotal != null
          ? persistedSubtotal - persistedPriceMinor
          : null,
    };
  }, [quote, persistedPriceMinor, persistedPoolCredits, persistedSubtotal]);

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
  const canContinue =
    (pricing != null || invoice != null) &&
    quote.poolCredits > 0 &&
    !quote.overEnterprise;
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
        posturePolicies: users == null ? 1 : policiesFor(postureId),
        sizeMult: users == null ? 1 : sizeMultFor(sizeId),
        pipelineMult: users == null ? 1 : pipelineMultFor(pipelineId),
        provisionedMonthlyVolume: quote.provisionedMonthlyVolume,
        poolCredits: quote.poolCredits,
        priceMinor: receiptQuote.priceMinor,
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
    const sig = buildStripeQuoteSig(
      quote.poolCredits,
      postureId,
      sizeId,
      pipelineId,
      poNumber,
    );
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
    if (sq.currency && sq.amountTotal != null) {
      setPersistedCurrency(sq.currency);
      setPersistedSubtotal(sq.amountSubtotal ?? null);
      setPersistedPriceMinor(sq.amountTotal);
      setPersistedPoolCredits(quote.poolCredits);
    }
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
    if (invoiceIssued) return invoice;
    if (teamId == null || quoteId == null) return invoice;
    if (!invoice) {
      await ensureQuote();
      await acceptBundleStripeQuote({ teamId, quoteId });
    }
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
    if (busy || pdfBusy || !canContinue) return;
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
        <Button
          variant="quiet"
          disabled={busy || pdfBusy}
          onClick={onBack ?? onClose}
        >
          {onBack
            ? t("portal.billing.prepaid.buy.back", "Back")
            : t("portal.billing.prepaid.buy.cancel", "Cancel")}
        </Button>
        <Button
          disabled={!canContinue || busy || pdfBusy}
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
        <Button disabled={busy || pdfBusy} onClick={payOnline}>
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
      className="portal-billing__bundle-modal portal-billing__checkout-modal--framed processor-prepay"
      ariaLabel={t(
        "portal.billing.prepaid.offer.title",
        "Get 12 months for the price of 10",
      )}
      title={
        resolving
          ? t("portal.billing.prepaid.buy.loadingTitle", "Loading your quote")
          : phase === "pay"
            ? t("portal.billing.prepaid.buy.payTitle", "Pay for your year")
            : t("portal.billing.prepaid.buy.creditTitle", "Prepay the year")
      }
      subtitle={
        !resolving && phase === "calc"
          ? t(
              "portal.billing.simple.prepayIntro",
              "A year of processing at a discount.",
            )
          : undefined
      }
      footer={resolving ? undefined : footer}
    >
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
            key={(pricing?.currency ?? currency) + ":" + ratePerRunMinor}
            credits={poolCredits}
            rate={ratePerRunMinor}
            selectionCurrency={pricing?.currency ?? currency}
            onCreditsChange={changePool}
            quote={receiptQuote}
            currency={currency}
            pricing={pricing}
            onCurrencyChange={(selected) => void changeCurrency(selected)}
            currencyBusy={busy || pdfBusy || !!invoice}
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
    <>
      <div className="portal-billing__bundle-receipt processor-prepay__receipt">
        {quote.listMinor != null && (
          <div className="portal-billing__bundle-receipt-row">
            <span>
              {t("portal.billing.simple.yearValue", "A year of processing")}
            </span>
            <strong>{formatMinor(quote.listMinor, currency)}</strong>
          </div>
        )}
        {quote.savingsMinor != null && quote.savingsMinor > 0 && (
          <div className="portal-billing__bundle-receipt-row">
            <span>
              {t(
                "portal.billing.simple.prepayDiscount",
                "Prepay discount · 12 for 10",
              )}
            </span>
            <strong className="processor-prepay__saving">
              −{formatMinor(quote.savingsMinor, currency)}
            </strong>
          </div>
        )}
        <div className="portal-billing__bundle-receipt-row">
          <strong>{t("payment.capacityStage.dueToday", "Due today")}</strong>
          <strong>
            {quote.priceMinor == null
              ? t(
                  "portal.billing.prepaid.calc.rateUnknown",
                  "We'll show the exact price at checkout.",
                )
              : formatMinor(quote.priceMinor, currency)}
          </strong>
        </div>
      </div>
      <Button
        variant="quiet"
        size="sm"
        disabled={downloading || quote.poolCredits <= 0}
        onClick={onDownload}
      >
        {downloading
          ? t("portal.billing.prepaid.review.downloading", "Preparing…")
          : t("portal.billing.prepaid.review.download", "Download quote (PDF)")}
      </Button>
    </>
  );
}

function CalculatorStep({
  credits,
  rate,
  selectionCurrency,
  onCreditsChange,
  quote,
  currency,
  pricing,
  onCurrencyChange,
  currencyBusy,
  onDownload,
  downloading,
  actionError,
}: {
  credits: number;
  rate: number | null;
  selectionCurrency: string;
  pricing: BundlePricing | null;
  onCurrencyChange: (currency: string) => void;
  currencyBusy: boolean;
  onCreditsChange: (credits: number) => void;
  quote: BundleQuoteBreakdown;
  currency: string;
  onDownload: () => void;
  downloading: boolean;
  actionError: string | null;
}) {
  const { t } = useTranslation();
  const presets = [12_000, 24_000, 48_000];
  const minorUnitScale = stripeMinorUnitScale(selectionCurrency);
  const yearValue =
    rate && rate > 0 ? Math.round(credits * rate) / minorUnitScale : null;
  const [custom, setCustom] = useState(
    yearValue == null || !presets.includes(yearValue),
  );
  const [draft, setDraft] = useState<number | string>(yearValue ?? "");
  const changeAmount = (value: number | string) => {
    setDraft(value);
    const amount = Number(value);
    onCreditsChange(
      rate && rate > 0 && Number.isFinite(amount) && amount > 0
        ? Math.round((amount * minorUnitScale) / rate)
        : 0,
    );
  };
  return (
    <div className="portal-billing__bundle-calc">
      {pricing && (
        <FormField
          label={t("portal.billing.prepaid.calc.currency", "Quote currency")}
          helperText={
            pricing.currencyLocked !== false
              ? t(
                  "portal.billing.prepaid.calc.currencyLocked",
                  "Uses your existing Stripe billing currency.",
                )
              : undefined
          }
        >
          <Select
            aria-label={t(
              "portal.billing.prepaid.calc.currency",
              "Quote currency",
            )}
            value={currency}
            comboboxProps={{ withinPortal: false }}
            options={(pricing.availableCurrencies ?? [currency]).map(
              (code) => ({ value: code, label: code.toUpperCase() }),
            )}
            disabled={currencyBusy || pricing.currencyLocked !== false}
            onChange={(selected) => {
              if (selected) onCurrencyChange(selected);
            }}
          />
        </FormField>
      )}
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
      <div className="processor-prepay__picker">
        <div
          className="processor-prepay__choices"
          role="group"
          aria-label={t("portal.billing.simple.yearSize", "Year size")}
        >
          <span>{t("portal.billing.simple.yearSize", "Year size")}</span>
          {presets.map((value) => (
            <Button
              key={value}
              variant="secondary"
              disabled={!rate || rate <= 0}
              aria-pressed={!custom && yearValue === value}
              onClick={() => {
                setCustom(false);
                changeAmount(value);
              }}
            >
              {formatMoneyMajor(value, selectionCurrency)}
            </Button>
          ))}
          <Button
            variant="secondary"
            aria-pressed={custom}
            disabled={!rate || rate <= 0}
            onClick={() => {
              setDraft(yearValue ?? "");
              setCustom(true);
            }}
          >
            {t("payment.capacityStage.other", "Other")}
          </Button>
        </div>
        {custom && rate != null && rate > 0 && (
          <div className="processor-prepay__custom">
            <NumberInput
              value={draft}
              onChange={changeAmount}
              hideControls
              clampBehavior="none"
              prefix={currencySymbol(selectionCurrency)}
              decimalScale={Math.log10(minorUnitScale)}
              allowNegative={false}
              aria-label={t("portal.billing.simple.yearSize", "Year size")}
            />
          </div>
        )}
      </div>
      <p className="processor-prepay__credits">
        {t("portal.billing.simple.creditEstimate", "≈ {{credits}} credits", {
          credits: quote.poolCredits.toLocaleString(),
        })}
      </p>
      <QuoteReceipt
        quote={quote}
        currency={currency}
        onDownload={onDownload}
        downloading={downloading}
      />
      <div className="processor-prepay__after">
        <strong>
          {t("portal.billing.simple.afterYear", "After the year")}
        </strong>
        <p>
          {t(
            "portal.billing.simple.afterYearNote",
            "No automatic renewal. Further processing needs an active metered plan and stays within its spend limit.",
          )}
        </p>
      </div>
    </div>
  );
}

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
