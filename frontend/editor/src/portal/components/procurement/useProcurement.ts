import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePortalLinked } from "@portal/contexts/usePortalLinked";
import { useAsync } from "@portal/hooks/useAsync";
import {
  acceptQuote,
  extendTrial,
  fetchLicenseFile,
  fetchQuotePdf,
  fetchSnapshot,
  goLive,
  issueQuote,
  resetProcurement,
  startAgreement,
  startTrial,
  type ProcurementSnapshot,
  type QuoteResult,
} from "@portal/api/procurement";

export type ProcurementExtra = null | "docs" | "schedule" | "trial" | "setup";

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
  /** Confirm the setup dialog: start the trial with the chosen deployment/seats, then open the flow. */
  onConfirmSetup: (deployment: string, seats: number) => void;
  onExtendTrial: () => void;
  onReset: () => void;
  onGenerate: (draft: QuoteResult) => void;
  onAcceptQuote: () => void;
  onAgree: () => void;
  onGoLive: () => void;
  onDownloadPdf: () => Promise<void>;
  onDownloadOfflineLicense: () => Promise<void>;
}

export function useProcurement(autoOpen = false): ProcurementController {
  const { t } = useTranslation();
  const isLinked = usePortalLinked();

  const state = useAsync<ProcurementSnapshot | null>(
    () => (isLinked ? fetchSnapshot() : Promise.resolve(null)),
    [isLinked],
  );
  const [snap, setSnap] = useState<ProcurementSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingLicense, setDownloadingLicense] = useState(false);
  const [invoicePdf, setInvoicePdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<ProcurementExtra>(null);

  const data = snap ?? (state.loading ? null : state.data);
  const started = data?.dealId != null;
  const stage = data?.stage;
  const latest = data?.latestQuote ?? null;
  const isIssued = latest?.status === "sent" || latest?.status === "open";
  // No live quote to act on (none yet, still a draft, or expired/canceled) → the buyer (re)builds.
  const isDraft =
    !latest ||
    ["draft", "expired", "canceled", "cancelled"].includes(latest.status);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSnap(await fetchSnapshot());
    } catch (e) {
      console.error("[procurement] action failed", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // The setup dialog collects deployment + seats first; the trial starts on confirm.
  const onStartTrial = () => setExtra("setup");
  const onConfirmSetup = (deployment: string, seats: number) =>
    run(async () => {
      await startTrial(deployment, seats);
      setExtra(null);
      setOpen(true);
    });
  const onExtendTrial = () => run(extendTrial);
  const onReset = () =>
    run(async () => {
      await resetProcurement();
      setEditing(false);
      setInvoicePdf(null);
    });
  const onGenerate = (draft: QuoteResult) =>
    run(async () => {
      await issueQuote(draft.quoteId);
      setEditing(false);
    });
  // Milestone → agreement (security) stage; then agreeing accepts into a subscription.
  const onAcceptQuote = () => run(startAgreement);
  const onAgree = () =>
    run(async () => {
      if (!latest) return;
      const res = await acceptQuote(latest.quoteId);
      setInvoicePdf(res.invoicePdf);
    });
  const onGoLive = () => run(goLive);

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
    onConfirmSetup,
    onExtendTrial,
    onReset,
    onGenerate,
    onAcceptQuote,
    onAgree,
    onGoLive,
    onDownloadPdf,
    onDownloadOfflineLicense,
  };
}
