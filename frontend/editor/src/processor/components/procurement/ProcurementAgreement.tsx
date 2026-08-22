import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@app/ui";
import {
  fetchAgreementDocument,
  fetchAgreementPdf,
  recordAgreementSignature,
  type QuoteResult,
} from "@processor/api/procurement";
import { DownloadIcon } from "@processor/components/icons";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";
import { useAsync } from "@processor/hooks/useAsync";
import "@processor/theme/surface.css";
import "@processor/views/Procurement.css";

/**
 * The agreement (security) step: the buyer reviews the full Stirling Enterprise Agreement — Master
 * Services Agreement + Order Form (from the quote) + Data Processing Addendum, one signature — then
 * signs it. The document body is served by the backend from the versioned legal registry (static
 * legal copy, English only); this component renders it, gates signing behind a scroll-through, and
 * captures the typed legal name, signatory, title, and authority. On sign it records the signature
 * (pinned to the exact document version + a hash) and then accepts the quote into a subscription.
 *
 * Presented as the document itself rather than a card about it: this step names the agreement in the
 * dialog's own header and carries its download there, so the terms are read on paper-like stock
 * instead of in app chrome. That is why it draws its own header — see ProcurementFlow.
 */
export function ProcurementAgreement({
  quote,
  busy,
  onAgree,
  onRequestChanges,
  onClose,
}: {
  quote: QuoteResult;
  busy: boolean;
  /** Accept the quote straight into a committed subscription (runs after the signature is saved). */
  onAgree: () => void;
  /** Hand the buyer to their SE to negotiate terms: closes this and opens scheduling. */
  onRequestChanges: () => void;
  /** This step draws the dialog's header, so it carries the close too. */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { data: doc, loading } = useAsync(fetchAgreementDocument, []);

  const [legalName, setLegalName] = useState(quote.config.businessName ?? "");
  const [signatory, setSignatory] = useState(quote.config.contactName ?? "");
  const [title, setTitle] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [signing, setSigning] = useState(false);
  const [downloadingMsa, setDownloadingMsa] = useState(false);
  const [error, setError] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const downloadMsa = async () => {
    setDownloadingMsa(true);
    setDownloadError(false);
    try {
      const blob = await fetchAgreementPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stirling-enterprise-agreement.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // Surface the failure — the PDF is rendered server-side, so a failure here means the
      // render service is unavailable rather than something the buyer can retry around.
      setDownloadError(true);
    } finally {
      setDownloadingMsa(false);
    }
  };

  const onScroll = () => {
    const el = docRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setScrolledToEnd(true);
    }
  };

  const ready =
    scrolledToEnd &&
    confirmed &&
    legalName.trim().length > 0 &&
    signatory.trim().length > 0;

  const sign = async () => {
    setError(false);
    setSigning(true);
    try {
      await recordAgreementSignature({
        customerLegalName: legalName.trim(),
        signatoryName: signatory.trim(),
        signatoryTitle: title.trim(),
        authorityConfirmed: confirmed,
      });
      onAgree(); // proceed into the committed subscription
    } catch {
      setError(true);
    } finally {
      // In `finally`, not only on failure: accepting can fail after the signature is recorded, and
      // the controller deliberately keeps this dialog open on failure so the error is readable. With
      // the flag left set, the button span the rest of the session and there was no way to retry.
      setSigning(false);
    }
  };

  return (
    <div className="processor-agreement">
      <StepModalHeader
        title={t("processor.procurement.agreement.docName")}
        subtitle={t("processor.procurement.agreement.docSub")}
        onClose={onClose}
        aside={
          // Grouped so the two document actions read as a pair, set apart from the close.
          <div className="processor-agreement__actions">
            {/* On the document, like the quote's: it downloads what is on screen. */}
            <Button
              variant="tertiary"
              size="sm"
              leftSection={<DownloadIcon size={14} />}
              loading={downloadingMsa}
              onClick={downloadMsa}
            >
              {t("processor.procurement.agreement.download")}
            </Button>
            {/* Redlines are a conversation, not a form: this hands the buyer to their SE rather than
                pretending the terms can be amended in the app. */}
            <Button variant="tertiary" size="sm" onClick={onRequestChanges}>
              {t("processor.procurement.agreement.requestChanges")}
            </Button>
          </div>
        }
      />

      {/* The tray scrolls, not the paper. The paper is its natural height inside it, so mid-document it
          runs flush to the footer with no grey beneath, and the tray's bottom padding only comes into
          view once the buyer reaches the end — the page ending is what shows they got there. */}
      {/* Focusable and named: signing is gated on scrolling to the end, so the
          tray has to be scrollable by keyboard as well as pointer. */}
      <div
        className="processor-agreement__tray processor-agreement__scroll"
        ref={docRef}
        onScroll={onScroll}
        tabIndex={0}
        role="group"
        aria-label={t("processor.procurement.agreement.docName")}
      >
        <div className="processor-surface processor-agreement__doc">
          {loading && <p>{t("processor.procurement.agreement.loading")}</p>}
          {!loading && !doc && (
            <p>{t("processor.procurement.agreement.loadError")}</p>
          )}
          {doc && (
            <>
              {/* Letterhead: the reference ties the terms to the quote they price, and the version
                  label pins what was signed. The document's own heading follows, so this adds a
                  masthead rather than repeating the title. */}
              <div className="processor-agreement__letterhead">
                <span className="processor-agreement__confidential">
                  {t("processor.procurement.agreement.confidential")}
                </span>
                <span>
                  {t("processor.procurement.agreement.ref", {
                    ref: quote.quoteNumber,
                    version: doc.versionLabel,
                  })}
                </span>
              </div>
              <div className="processor-agreement__md">
                <Markdown remarkPlugins={[remarkGfm]}>{doc.markdown}</Markdown>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="processor-proc__error">
          {t("processor.procurement.agreement.signError")}
        </p>
      )}
      {downloadError && (
        <p className="processor-proc__error">
          {t("processor.procurement.agreement.downloadDraftError")}
        </p>
      )}

      {/* The signature block: who is bound, who signs, and the act of signing, on one line — the
          shape of a paper signature block rather than a form above a button. The consent sits
          directly under the fields it qualifies, with no rule between them: it is part of signing,
          not a separate section, and boxing it cost the document a quarter of its height. */}
      <div className="processor-qb__foot processor-agreement__signbar">
        <div className="processor-agreement__signrow">
          <div className="processor-qb__row processor-agreement__signfields">
            <label className="processor-qb__field">
              <span className="processor-qb__field-label">
                {t("processor.procurement.agreement.legalName")}
              </span>
              <input
                value={legalName}
                placeholder={t(
                  "processor.procurement.agreement.legalNamePlaceholder",
                )}
                onChange={(e) => setLegalName(e.target.value)}
              />
            </label>
            <label className="processor-qb__field">
              <span className="processor-qb__field-label">
                {t("processor.procurement.agreement.signatory")}
              </span>
              <input
                value={signatory}
                placeholder={t(
                  "processor.procurement.agreement.signatoryPlaceholder",
                )}
                onChange={(e) => setSignatory(e.target.value)}
              />
            </label>
            <label className="processor-qb__field">
              <span className="processor-qb__field-label">
                {t("processor.procurement.agreement.signatoryTitle")}
              </span>
              <input
                value={title}
                placeholder={t(
                  "processor.procurement.agreement.signatoryTitlePlaceholder",
                )}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>
          <Button
            variant="primary"
            loading={busy || signing}
            disabled={!ready}
            onClick={sign}
          >
            {t("processor.procurement.agreement.agreeCta")}
          </Button>
        </div>

        {/* Consent under the fields it qualifies; the gate's state under the button it gates, so the
            reason signing is unavailable sits beside the unavailable thing. */}
        <div className="processor-agreement__signfoot">
          <label className="processor-agreement__accept">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!scrolledToEnd}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>{t("processor.procurement.agreement.confirm")}</span>
          </label>
          {doc && !scrolledToEnd && (
            <span className="processor-agreement__gate">
              {t("processor.procurement.agreement.scrollHint")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
