import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Card } from "@app/ui";
import {
  fetchAgreementDocument,
  fetchAgreementPdf,
  recordAgreementSignature,
  type QuoteResult,
} from "@portal/api/procurement";
import { DownloadIcon } from "@portal/components/icons";
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
  const [downloadingMsa, setDownloadingMsa] = useState(false);
  const [error, setError] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  /**
   * Fall back to the browser's print-to-PDF when the server can't render the agreement — the
   * WeasyPrint pipeline isn't available in every environment (e.g. local dev), and the buyer must
   * still be able to keep a copy of the draft. Prints the already-rendered agreement body from a
   * hidden iframe so it isn't popup-blocked. Returns false if the document isn't in the DOM yet.
   */
  const printDraftFallback = (): boolean => {
    const body = docRef.current?.querySelector(
      ".portal-agreement__md",
    )?.innerHTML;
    if (!body) return false;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const cw = iframe.contentWindow;
    const cd = iframe.contentDocument ?? cw?.document;
    if (!cw || !cd) {
      iframe.remove();
      return false;
    }
    const draftNotice =
      doc && doc.status !== "final"
        ? `<p class="draft">${t("portal.procurement.agreement.draftBadge")}</p>`
        : "";
    cd.open();
    cd.write(
      `<!doctype html><html><head><meta charset="utf-8">` +
        `<title>stirling-enterprise-agreement</title><style>` +
        `body{font:14px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;` +
        `color:#111;max-width:44rem;margin:2rem auto;padding:0 1.5rem;}` +
        `h1,h2,h3{line-height:1.3;}table{border-collapse:collapse;width:100%;}` +
        `td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;}` +
        `.draft{color:#b45309;font-weight:600;font-size:12px;text-transform:uppercase;` +
        `letter-spacing:.04em;margin-bottom:1.25rem;}</style></head><body>` +
        `${draftNotice}${body}</body></html>`,
    );
    cd.close();
    const print = () => {
      cw.focus();
      cw.print();
      setTimeout(() => iframe.remove(), 1000);
    };
    if (cd.readyState === "complete") setTimeout(print, 100);
    else cw.addEventListener("load", print);
    return true;
  };

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
      // Server render unavailable — keep the buyer whole with the browser print fallback.
      if (!printDraftFallback()) setDownloadError(true);
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
      {downloadError && (
        <p className="portal-proc__error">
          {t("portal.procurement.agreement.downloadDraftError")}
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
        <Button
          variant="secondary"
          leftSection={<DownloadIcon size={15} />}
          loading={downloadingMsa}
          onClick={downloadMsa}
        >
          {t("portal.procurement.agreement.downloadAgreement")}
        </Button>
        <Button
          variant="secondary"
          leftSection={<DownloadIcon size={15} />}
          loading={downloading}
          onClick={onDownload}
        >
          {t("portal.procurement.agreement.downloadQuote")}
        </Button>
        <Button variant="tertiary" onClick={onEdit}>
          {t("portal.procurement.milestone.edit")}
        </Button>
      </div>
    </Card>
  );
}
