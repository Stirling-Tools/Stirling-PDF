import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button, Modal } from "@shared/components";
import type { LedgerDoc, ProcurementResponse } from "@portal/api/procurement";
import {
  payOnline,
  requestDocument,
  signAgreement,
  uploadPurchaseOrder,
} from "@portal/api/procurement";
import { USD } from "@portal/components/procurement/format";

interface ActionCopy {
  title: string;
  subtitle: string;
  body: string;
  cta: string;
}

/** Per-action confirmation copy, with the fee folded into the CTA when present. */
function actionCopy(doc: LedgerDoc, t: TFunction): ActionCopy {
  const fee = doc.fee !== undefined ? ` · ${USD.format(doc.fee)}` : "";
  switch (doc.action) {
    case "sign":
      return {
        title: t("procurement.modal.signTitle"),
        subtitle: doc.name,
        body: t("procurement.modal.signBody"),
        cta: t("procurement.modal.signCta"),
      };
    case "pay":
      return {
        title: t("procurement.modal.payTitle"),
        subtitle: doc.name,
        body: t("procurement.modal.payBody"),
        cta: t("procurement.modal.payCta"),
      };
    case "upload":
      return {
        title: t("procurement.modal.uploadTitle"),
        subtitle: doc.name,
        body: t("procurement.modal.uploadBody"),
        cta: t("procurement.modal.uploadCta"),
      };
    case "request":
      return {
        title: t("procurement.modal.requestTitle"),
        subtitle: doc.name,
        body: doc.fee
          ? t("procurement.modal.requestBodyPaid")
          : t("procurement.modal.requestBodyFree"),
        cta: `${t("procurement.modal.requestCta")}${fee}`,
      };
    default:
      return {
        title: t("procurement.modal.downloadTitle"),
        subtitle: doc.name,
        body: t("procurement.modal.downloadBody"),
        cta: t("procurement.modal.downloadCta"),
      };
  }
}

/**
 * Confirmation modal for a document's gating action. Owns its in-flight state;
 * on success it hands the updated deal back to the caller via `onDone` so the
 * journey re-renders. Downloads are client-side and just close the modal.
 */
export function ActionModal({
  doc,
  onClose,
  onDone,
}: {
  doc: LedgerDoc | null;
  onClose: () => void;
  onDone: (next: ProcurementResponse) => void;
}) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  if (!doc) return null;
  const copy = actionCopy(doc, t);
  const needsFile = doc.action === "upload";

  async function submit() {
    if (!doc) return;
    setSubmitting(true);
    try {
      let next: ProcurementResponse | null = null;
      switch (doc.action) {
        case "sign":
          next = await signAgreement(doc.id);
          break;
        case "pay":
          next = await payOnline();
          break;
        case "upload":
          if (file) next = await uploadPurchaseOrder(file);
          break;
        case "request":
          next = await requestDocument(doc.id, doc.action);
          break;
        default:
          // download is client-side; no state change.
          break;
      }
      setFile(null);
      if (next) onDone(next);
      else onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="md"
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        <div className="portal-proc__modal-actions">
          <Button variant="ghost" onClick={onClose}>
            {t("procurement.modal.cancel")}
          </Button>
          <Button
            variant="gradient"
            accent="purple"
            loading={submitting}
            disabled={needsFile && !file}
            onClick={submit}
          >
            {copy.cta}
          </Button>
        </div>
      }
    >
      <p className="portal-proc__modal-body">{copy.body}</p>
      {needsFile && (
        <div className="portal-proc__upload">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="portal-proc__upload-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            {t("procurement.modal.chooseFile")}
          </Button>
          <span className="portal-proc__upload-name">
            {file ? file.name : t("procurement.modal.noFile")}
          </span>
        </div>
      )}
    </Modal>
  );
}
