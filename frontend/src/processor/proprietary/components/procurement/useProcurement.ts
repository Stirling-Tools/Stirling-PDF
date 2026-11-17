import { SaasSessionRequiredError } from "@editor/portal/auth/portalSaasSession";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePortalLinked } from "@editor/portal/contexts/usePortalLinked";
import { qk } from "@editor/portal/queries/keys";
import { toAsyncState } from "@editor/portal/queries/adapters";
import {
  acceptQuote,
  extendTrial,
  fetchLicenseFile,
  fetchQuotePdf,
  fetchSignedAgreementPdf,
  fetchSnapshot,
  issueQuote,
  recordInterest,
  recordLegalConsent,
  startAgreement,
  startTrial,
  type ProcurementSnapshot,
  type QuoteResult,
  type TrialSetupDetails,
} from "@editor/portal/api/procurement";
import { downloadFile } from "@editor/services/downloadService";

/** A dialog opened over the Enterprise page. */
export type ProcurementExtra = null | "schedule";

/**
 * A linked account's deal state and actions, shared by the Enterprise page and its dialogs.
 */
export interface ProcurementController {
  isLinked: boolean;
  loading: boolean;
  loadError: string | null;
  retry: () => void;
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
  /** The latest quote's invoice PDF, or the one accepting it just returned. */
  invoicePdf: string | null;
  /**
   * Record enterprise interest. Persisting the intent is what keeps the enterprise surface off
   * accounts that never asked for it, and makes drop-off before the trial visible; it is
   * best-effort, so a failed write never blocks the buyer.
   */
  onExploreEnterprise: () => void;
  /** Start the trial with the deployment, seats and buyer details from the setup form. */
  onConfirmSetup: (
    deployment: string,
    seats: number,
    details: TrialSetupDetails,
  ) => void;
  onExtendTrial: () => void;
  /** Issue the priced draft. Leaves the modal open: the issued quote becomes the review step. */
  onGenerate: (draft: QuoteResult) => Promise<void>;
  /**
   * Accept the reviewed quote and advance to the agreement step — does NOT charge Stripe. Taken from
   * the Enterprise page, and opens the agreement on success.
   */
  onAcceptQuote: () => Promise<void>;
  onAgree: () => void;
  onDownloadPdf: () => Promise<void>;
  onDownloadOfflineLicense: () => Promise<void>;
  /** Download the stored signed enterprise agreement (available once signed). */
  onDownloadSignedAgreement: () => Promise<void>;
}

/**
 * The deal snapshot, null when this account has no link to price against. One shared cache entry
 * for billing and the Enterprise page, so moving between them does not flash the loading state.
 * No retry: the page gates all its content on `loading`, which backoff would hold true.
 */
export function useProcurementSnapshot() {
  const isLinked = usePortalLinked();
  return useQuery<ProcurementSnapshot | null>({
    queryKey: qk.procurement(isLinked),
    queryFn: () => (isLinked ? fetchSnapshot() : Promise.resolve(null)),
    retry: false,
  });
}

export function useProcurement(): ProcurementController {
  const { t } = useTranslation();
  const isLinked = usePortalLinked();
  const queryClient = useQueryClient();
  const snapshotKey = qk.procurement(isLinked);
  const query = useProcurementSnapshot();
  const state = toAsyncState(query);
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

  function reportError(cause: unknown, message: string) {
    if (cause instanceof SaasSessionRequiredError) {
      // Recovery is the session banner above; keep unfinished purchases for an explicit retry.
      setOpen(false);
      setExtra(null);
      setError(null);
    } else {
      setError(message);
    }
  }

  /**
   * Run a deal action, then refresh the snapshot so every reader sees the new stage.
   *
   * `closeOnSuccess` ends the step. Each stage is its own visit — a buyer can sit in one for days —
   * so finishing one returns them to the page instead of gliding into the next. Deliberately
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
      // The wallet is left to the page, which refreshes its server-side cache first.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.teamMy() }),
        queryClient.invalidateQueries({ queryKey: ["portal", "users"] }),
      ]);
      if (opts?.closeOnSuccess) setOpen(false);
      return true;
    } catch (e) {
      console.error("[procurement] action failed", e);
      reportError(e, e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const onExploreEnterprise = () => {
    void recordInterest()
      .then((snap) => queryClient.setQueryData(snapshotKey, snap))
      .catch((e) => {
        console.error("[procurement] recording interest failed", e);
        if (e instanceof SaasSessionRequiredError) reportError(e, e.message);
      });
  };
  const onConfirmSetup = (
    deployment: string,
    seats: number,
    details: TrialSetupDetails,
  ) =>
    run(() => {
      void recordLegalConsent("eula", "trial"); // clickwrap consent, best-effort
      return startTrial(deployment, seats, details);
    });
  const onExtendTrial = () => run(extendTrial);
  // Deliberately does not close: the issued quote returns through the snapshot and becomes the
  // builder's review step, so the buyer reads the paper they just generated instead of being dropped
  // back on the page to find it again.
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
   * page. Accepting is an explicit decision the buyer has just taken from the page itself, so putting
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
      // A download, not window.open: an open after an await is often popup-blocked.
      await downloadFile({
        data: blob,
        filename: `${latest.quoteNumber || "quote"}.pdf`,
      });
    } catch (e) {
      console.error("[procurement] quote PDF download failed", e);
      reportError(e, t("portal.procurement.milestone.downloadError"));
    } finally {
      setDownloading(false);
    }
  }

  async function onDownloadOfflineLicense() {
    setDownloadingLicense(true);
    try {
      const cert = await fetchLicenseFile();
      const blob = new Blob([cert], { type: "text/plain" });
      await downloadFile({ data: blob, filename: "stirling-enterprise.lic" });
    } catch (e) {
      console.error("[procurement] offline licence download failed", e);
      reportError(e, t("portal.procurement.license.downloadError"));
    } finally {
      setDownloadingLicense(false);
    }
  }

  async function onDownloadSignedAgreement() {
    setDownloadingAgreement(true);
    try {
      const blob = await fetchSignedAgreementPdf();
      await downloadFile({
        data: blob,
        filename: "stirling-enterprise-agreement.pdf",
      });
    } catch (e) {
      console.error("[procurement] signed agreement download failed", e);
      reportError(e, t("portal.procurement.agreement.downloadError"));
    } finally {
      setDownloadingAgreement(false);
    }
  }

  return {
    isLinked,
    loading: state.loading,
    loadError:
      state.error && !(state.error instanceof SaasSessionRequiredError)
        ? state.error instanceof Error
          ? state.error.message
          : String(state.error)
        : null,
    retry: () => {
      void query.refetch();
    },
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
    invoicePdf: latest?.invoicePdf ?? invoicePdf,
    onExploreEnterprise,
    onConfirmSetup,
    onExtendTrial,
    onGenerate,
    onAcceptQuote,
    onAgree,
    onDownloadPdf,
    onDownloadOfflineLicense,
    onDownloadSignedAgreement,
  };
}
