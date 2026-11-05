import { useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@editor/ui";
import {
  fetchAgreementDocument,
  fetchAgreementPdf,
  recordAgreementSignature,
  type QuoteResult,
} from "@processor/api/procurement";
import { Icon } from "@editor/ui/Icon";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";
import { useAsync } from "@processor/hooks/useAsync";
import "@processor/theme/surface.css";
import {
  ConsentCheckbox,
  Field,
  focusFirstInvalid,
  isFilled,
} from "@processor/components/procurement/formField";
import "@processor/views/Procurement.css";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

/**
 * The agreement (security) step: the buyer reviews the full Stirling Enterprise Agreement — Master
 * Services Agreement + Order Form (from the quote) + Data Processing Addendum, one signature — then
 * signs it. The document body is served by the backend from the versioned legal registry (static
 * legal copy, English only); this component renders it in full and captures the typed legal name,
 * signatory, title, and authority. On sign it records the signature
 * (pinned to the exact document version + a hash) and then accepts the quote into a subscription.
 * It draws its own header, which names the agreement and carries its download.
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
  /** This step draws its own header, so it carries the close too. */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { data: doc, loading } = useAsync(fetchAgreementDocument, []);

  const [legalName, setLegalName] = useState(quote.config.businessName ?? "");
  const [signatory, setSignatory] = useState(quote.config.contactName ?? "");
  const [title, setTitle] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [downloadingMsa, setDownloadingMsa] = useState(false);
  const [error, setError] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

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

  // A signature is pinned to the document's version, so there is nothing to sign until it shows.
  const valid = {
    legalName: isFilled(legalName),
    signatory: isFilled(signatory),
    confirmed,
  };
  const ready = doc != null && Object.values(valid).every(Boolean);
  // Signing stays clickable once the document is in; a blocked click marks what is missing.
  const [tried, setTried] = useState(false);
  const required = t("portal.procurement.validation.required");
  const attemptSign = () => {
    if (!ready) {
      setTried(true);
      focusFirstInvalid();
      return;
    }
    void sign();
  };

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
      onAgree();
    } catch {
      setError(true);
    } finally {
      // In `finally`, not only on failure: accepting can fail after the signature is recorded, and
      // the dialog stays open on failure, so the button must reset for a retry.
      setSigning(false);
    }
  };

  return (
    <div className="portal-agreement">
      <StepModalHeader
        title={t("portal.procurement.agreement.docName")}
        subtitle={t("portal.procurement.agreement.docSub")}
        onClose={onClose}
        aside={
          // Grouped so the two document actions read as a pair, set apart from the close.
          <div className="portal-agreement__actions">
            {/* On the document, like the quote's: it downloads what is on screen. */}
            <Button
              variant="tertiary"
              size="sm"
              leftSection={<Icon name="download" size={14} />}
              loading={downloadingMsa}
              onClick={downloadMsa}
            >
              {t("portal.procurement.agreement.download")}
            </Button>
            {/* Redlines are a conversation, not a form: this hands the buyer to their SE rather than
                pretending the terms can be amended in the app. */}
            <Button variant="tertiary" size="sm" onClick={onRequestChanges}>
              {t("portal.procurement.agreement.requestChanges")}
            </Button>
          </div>
        }
      />

      <div className="portal-agreement__tray">
        <div className="portal-surface portal-agreement__doc">
          {loading && <p>{t("portal.procurement.agreement.loading")}</p>}
          {!loading && !doc && (
            <p>{t("portal.procurement.agreement.loadError")}</p>
          )}
          {doc && (
            <>
              {/* Letterhead: the reference ties the terms to the quote they price, and the version
                  label pins what was signed. The document's own heading follows, so this adds a
                  masthead rather than repeating the title. */}
              <div className="portal-agreement__letterhead">
                <span className="portal-agreement__confidential">
                  {t("portal.procurement.agreement.confidential")}
                </span>
                <span>
                  {t("portal.procurement.agreement.ref", {
                    ref: quote.quoteNumber,
                    version: doc.versionLabel,
                  })}
                </span>
              </div>
              <div className="portal-agreement__md">
                <Markdown remarkPlugins={[remarkGfm]}>{doc.markdown}</Markdown>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="portal-proc__error">
          {t("portal.procurement.agreement.signError")}
        </p>
      )}
      {downloadError && (
        <p className="portal-proc__error">
          {t("portal.procurement.agreement.downloadDraftError")}
        </p>
      )}

      {/* The signature block: who is bound, who signs, and the act of signing, on one line like a
          paper signature block. The consent sits directly under the fields it qualifies. */}
      <div className="portal-qb__foot portal-agreement__signbar">
        <div className="portal-agreement__signrow">
          <div className="portal-qb__row portal-agreement__signfields">
            <Field
              label={t("portal.procurement.agreement.legalName")}
              required
              invalid={tried && !valid.legalName}
              error={required}
            >
              <input
                value={legalName}
                className={privateContentClassName}
                placeholder={t(
                  "portal.procurement.agreement.legalNamePlaceholder",
                )}
                onChange={(e) => setLegalName(e.target.value)}
              />
            </Field>
            <Field
              label={t("portal.procurement.agreement.signatory")}
              required
              invalid={tried && !valid.signatory}
              error={required}
            >
              <input
                value={signatory}
                className={privateContentClassName}
                placeholder={t(
                  "portal.procurement.agreement.signatoryPlaceholder",
                )}
                onChange={(e) => setSignatory(e.target.value)}
              />
            </Field>
            <Field label={t("portal.procurement.agreement.signatoryTitle")}>
              <input
                value={title}
                className={privateContentClassName}
                placeholder={t(
                  "portal.procurement.agreement.signatoryTitlePlaceholder",
                )}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
          </div>
          <Button
            variant="primary"
            loading={busy || signing}
            disabled={doc == null}
            onClick={attemptSign}
          >
            {t("portal.procurement.agreement.agreeCta")}
          </Button>
        </div>

        <div className="portal-agreement__signfoot">
          <ConsentCheckbox
            className="portal-agreement__accept"
            checked={confirmed}
            onChange={setConfirmed}
            invalid={tried && !confirmed}
            error={t("portal.procurement.validation.confirm")}
          >
            {t("portal.procurement.agreement.confirm")}
          </ConsentCheckbox>
        </div>
      </div>
    </div>
  );
}
