import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Card } from "@app/ui";
import {
  fetchAgreementDocument,
  recordAgreementSignature,
  type QuoteResult,
} from "@portal/api/procurement";
import { useAsync } from "@portal/hooks/useAsync";
import "@portal/views/Procurement.css";

/**
 * The agreement (security) step: the buyer reviews the full Stirling Enterprise Agreement — Master
 * Services Agreement + Order Form (from the quote) + Data Processing Addendum, one signature — then
 * signs it. The document body is served by the backend from the versioned legal registry (static
 * legal copy, English only); this component renders it, gates signing behind a scroll-through, and
 * captures the typed legal name, signatory, title, and authority. On sign it records the signature
 * (pinned to the exact document version + a hash) and then accepts the quote into a subscription.
 */
export function ProcurementAgreement({
  quote,
  busy,
  downloading,
  onAgree,
  onDownload,
  onEdit,
}: {
  quote: QuoteResult;
  busy: boolean;
  downloading: boolean;
  /** Accept the quote straight into a committed subscription (runs after the signature is saved). */
  onAgree: () => void;
  onDownload: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { data: doc, loading } = useAsync(fetchAgreementDocument, []);

  const [legalName, setLegalName] = useState(quote.config.businessName ?? "");
  const [signatory, setSignatory] = useState(quote.config.contactName ?? "");
  const [title, setTitle] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

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
      setSigning(false);
    }
  };

  return (
    <Card padding="loose">
      <span className="portal-proc__eyebrow">
        {t("portal.procurement.agreement.eyebrow")}
        {doc && doc.status !== "final" && (
          <span className="portal-agreement__draft">
            {t("portal.procurement.agreement.draftBadge")}
          </span>
        )}
      </span>
      <h3 className="portal-proc__builder-title">
        {t("portal.procurement.agreement.title")}
      </h3>
      <p className="portal-proc__subtitle">
        {doc
          ? t("portal.procurement.agreement.version", {
              label: doc.versionLabel,
            })
          : t("portal.procurement.agreement.intro")}
      </p>

      <div
        className="portal-agreement__doc portal-agreement__scroll"
        ref={docRef}
        onScroll={onScroll}
      >
        {loading && <p>{t("portal.procurement.agreement.loading")}</p>}
        {!loading && !doc && (
          <p>{t("portal.procurement.agreement.loadError")}</p>
        )}
        {doc && (
          <div className="portal-agreement__md">
            <Markdown remarkPlugins={[remarkGfm]}>{doc.markdown}</Markdown>
          </div>
        )}
      </div>

      {!scrolledToEnd && doc && (
        <p className="portal-qb__hint">
          {t("portal.procurement.agreement.scrollHint")}
        </p>
      )}

      <div className="portal-qb__row portal-agreement__signfields">
        <label className="portal-qb__field">
          <span className="portal-qb__field-label">
            {t("portal.procurement.agreement.legalName")}
          </span>
          <input
            value={legalName}
            placeholder={t("portal.procurement.agreement.legalNamePlaceholder")}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </label>
        <label className="portal-qb__field">
          <span className="portal-qb__field-label">
            {t("portal.procurement.agreement.signatory")}
          </span>
          <input
            value={signatory}
            placeholder={t("portal.procurement.agreement.signatoryPlaceholder")}
            onChange={(e) => setSignatory(e.target.value)}
          />
        </label>
        <label className="portal-qb__field">
          <span className="portal-qb__field-label">
            {t("portal.procurement.agreement.signatoryTitle")}
          </span>
          <input
            value={title}
            placeholder={t(
              "portal.procurement.agreement.signatoryTitlePlaceholder",
            )}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      </div>

      <label className="portal-qb__eula portal-agreement__accept">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!scrolledToEnd}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>{t("portal.procurement.agreement.confirm")}</span>
      </label>

      {error && (
        <p className="portal-proc__error">
          {t("portal.procurement.agreement.signError")}
        </p>
      )}

      <div className="portal-proc__payment-actions">
        <Button
          variant="primary"
          accent="premium"
          loading={busy || signing}
          disabled={!ready}
          onClick={sign}
        >
          {t("portal.procurement.agreement.agreeCta")}
        </Button>
        <Button variant="secondary" loading={downloading} onClick={onDownload}>
          {t("portal.procurement.milestone.download")}
        </Button>
        <Button variant="tertiary" onClick={onEdit}>
          {t("portal.procurement.milestone.edit")}
        </Button>
      </div>
    </Card>
  );
}
