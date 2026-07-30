import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePortalLinked } from "@portal/contexts/usePortalLinked";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import {
  acceptQuote,
  extendTrial,
  fetchLicenseFile,
  fetchQuotePdf,
  fetchSignedAgreementPdf,
  fetchSnapshot,
  issueQuote,
  recordInterest,
  resetProcurement,
  startAgreement,
  startTrial,
  type ProcurementSnapshot,
  type QuoteResult,
  type TrialSetupDetails,
} from "@portal/api/procurement";

export type ProcurementExtra =
  | null
  | "license"
  | "schedule"
  | "trial"
  | "setup"
  | "documents";

/**
 * Owns the procurement deal state and actions shared by the Home hero footer
 * (deal-status hero) and the takeover flow modals. Extracted from
 * ProcurementHome so the deal-status hero can render inside the tier hero card
 * while the flow modals live alongside it. Gated on an account link.
 */
export interface ProcurementController {
  isLinked: boolean;
  loading: boolean;
  data: ProcurementSnapshot | null;
  started: boolean;
  stage: ProcurementSnapshot["stage"] | undefined;
  latest: QuoteResult | null;
  isIssued: boolean;
  isDraft: boolean;
  busy: boolean;
  downloading: boolean;
  downloadingLicense: boolean;
  downloadingAgreement: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  open: boolean;
  setOpen: (b: boolean) => void;
  editing: boolean;
  setEditing: (b: boolean) => void;
  extra: ProcurementExtra;
  setExtra: (e: ProcurementExtra) => void;
  invoicePdf: string | null;
  /** Open the trial-setup dialog (deployment + seats) — the trial only starts once it's confirmed. */
  onStartTrial: () => void;
  /**
   * Record enterprise interest and open trial setup. Persisting the intent is what keeps the
   * enterprise surface off accounts that never asked for it, and makes drop-off at this step
   * visible; the dialog opens either way, so a failed write never blocks the buyer.
   */
  onExploreEnterprise: () => void;
  /** Confirm the setup dialog: start the trial with the chosen deployment/seats, then open the flow. */
  onConfirmSetup: (
    deployment: string,
    seats: number,
    details: TrialSetupDetails,
  ) => void;
  onExtendTrial: () => void;
  onReset: () => void;
  /** Issue the priced draft. Leaves the modal open: the issued quote becomes the review step. */
  onGenerate: (draft: QuoteResult) => Promise<void>;
  /**
   * Accept the reviewed quote and advance to the agreement step — does NOT charge Stripe. Taken from
   * the deal card, and opens the agreement on success.
   */
  onAcceptQuote: () => Promise<void>;
  onAgree: () => void;
  onDownloadPdf: () => Promise<void>;
  onDownloadOfflineLicense: () => Promise<void>;
  /** Download the stored signed enterprise agreement (available once signed). */
  onDownloadSignedAgreement: () => Promise<void>;
}

export function useProcurement(autoOpen = false): ProcurementController {
  const { t } = useTranslation();
  const isLinked = usePortalLinked();

  // Through the shared query cache, not a per-mount fetch: the snapshot survives navigation, so
  // returning to Home renders the deal from cache instead of flashing the loading state again.
  // No retry — a failing snapshot must not hold `loading` true through backoff, since the hero
  // gates its whole card on it.
  const queryClient = useQueryClient();
  const snapshotKey = qk.procurement(isLinked);
  const state = toAsyncState(
    useQuery<ProcurementSnapshot | null>({
      queryKey: snapshotKey,
      queryFn: () => (isLinked ? fetchSnapshot() : Promise.resolve(null)),
      retry: false,
    }),
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingLicense, setDownloadingLicense] = useState(false);
  const [downloadingAgreement, setDownloadingAgreement] = useState(false);
  const [invoicePdf, setInvoicePdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<ProcurementExtra>(null);

  const data = state.data;
  const started = data?.dealId != null;
  const stage = data?.stage;
  const latest = data?.latestQuote ?? null;
  const isIssued = latest?.status === "sent" || latest?.status === "open";
  // No live quote to act on (none yet, still a draft, or expired/canceled) → the buyer (re)builds.
  const isDraft =
    !latest ||
    ["draft", "expired", "canceled", "cancelled"].includes(latest.status);

  /**
   * Run a deal action, then refresh the snapshot so every reader sees the new stage.
   *
   * `closeOnSuccess` ends the step. Each stage is its own visit — a buyer can sit in one for days —
   * so finishing one returns them to the deal card instead of gliding into the next. Deliberately
   * not in a `finally`: a failure has to leave the modal open, or the error banner this sets would
   * be torn down with it and the buyer would be left with no idea what went wrong.
   *
   * Returns whether the action succeeded, since failures are reported through the banner rather than
   * thrown — a caller that follows up with navigation has no other way to tell.
   */
  async function run(
    fn: () => Promise<unknown>,
    opts?: { closeOnSuccess?: boolean },
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      queryClient.setQueryData(snapshotKey, await fetchSnapshot());
      if (opts?.closeOnSuccess) setOpen(false);
      return true;
    } catch (e) {
      console.error("[procurement] action failed", e);
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // The setup dialog collects deployment + seats first; the trial starts on confirm. Starting the
  // trial is a step in its own right, so it ends on the card — the buyer builds a quote when ready.
  const onStartTrial = () => setExtra("setup");
  const onExploreEnterprise = () => {
    setExtra("setup");
    void recordInterest()
      .then((snap) => queryClient.setQueryData(snapshotKey, snap))
      .catch((e) =>
        console.error("[procurement] recording interest failed", e),
      );
  };
  const onConfirmSetup = (
    deployment: string,
    seats: number,
    details: TrialSetupDetails,
  ) =>
    run(async () => {
      await startTrial(deployment, seats, details);
      setExtra(null);
    });
  const onExtendTrial = () => run(extendTrial);
  const onReset = () =>
    run(async () => {
      await resetProcurement();
      setEditing(false);
      setInvoicePdf(null);
    });
  // Deliberately does not close: the issued quote returns through the snapshot and becomes the
  // builder's review step, so the buyer reads the paper they just generated instead of being dropped
  // back on the card to find it again.
  const onGenerate = async (draft: QuoteResult) => {
    await run(async () => {
      await issueQuote(draft.quoteId);
      setEditing(false);
    });
  };

  /**
   * Accept the reviewed quote: advance to the agreement step only. No Stripe — the buyer can read and
   * download the plain quote before taking on the legal documents.
   *
   * This is the one transition that carries straight on into the next stage rather than ending on the
   * card. Accepting is an explicit decision the buyer has just taken from the card itself, so putting
   * them back there to press a second button to see what they accepted reads as a dead end.
   */
  const onAcceptQuote = async () => {
    if (await run(startAgreement)) setOpen(true);
  };

  // Signing the agreement is the commitment point: it accepts the issued quote into a committed
  // subscription (Stripe), and provisioning upgrades the licence server-side. Payment itself is
  // invoice + bank transfer, so it settles out of band — there is no in-app step to close.
  const onAgree = () =>
    run(
      async () => {
        if (!latest) return;
        const res = await acceptQuote(latest.quoteId);
        setInvoicePdf(res.invoicePdf);
      },
      { closeOnSuccess: true },
    );

  async function onDownloadPdf() {
    if (!latest) return;
    setDownloading(true);
    try {
      const blob = await fetchQuotePdf(latest.quoteId);
      // A same-gesture <a download> click is reliable; window.open after an await is often
      // popup-blocked (which is what made this take "a few goes").
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${latest.quoteNumber || "quote"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error("[procurement] quote PDF download failed", e);
      setError(t("portal.procurement.milestone.downloadError"));
    } finally {
      setDownloading(false);
    }
  }

  async function onDownloadOfflineLicense() {
    setDownloadingLicense(true);
    try {
      const cert = await fetchLicenseFile();
      const blob = new Blob([cert], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stirling-enterprise.lic";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error("[procurement] offline licence download failed", e);
      setError(t("portal.procurement.license.downloadError"));
    } finally {
      setDownloadingLicense(false);
    }
  }

  async function onDownloadSignedAgreement() {
    setDownloadingAgreement(true);
    try {
      const blob = await fetchSignedAgreementPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stirling-enterprise-agreement.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error("[procurement] signed agreement download failed", e);
      setError(t("portal.procurement.agreement.downloadError"));
    } finally {
      setDownloadingAgreement(false);
    }
  }

  // A deep link (/procurement) opens the flow when a deal is already underway; if there's no deal
  // yet it must NOT silently start a trial — leave the modal closed so the Start-trial CTA shows.
  useEffect(() => {
    if (autoOpen && started) setOpen(true);
  }, [autoOpen, started]);

  return {
    isLinked,
    loading: state.loading,
    data,
    started,
    stage,
    latest,
    isIssued,
    isDraft,
    busy,
    downloading,
    downloadingLicense,
    downloadingAgreement,
    error,
    setError,
    open,
    setOpen,
    editing,
    setEditing,
    extra,
    setExtra,
    invoicePdf,
    onStartTrial,
    onExploreEnterprise,
    onConfirmSetup,
    onExtendTrial,
    onReset,
    onGenerate,
    onAcceptQuote,
    onAgree,
    onDownloadPdf,
    onDownloadOfflineLicense,
    onDownloadSignedAgreement,
  };
}
