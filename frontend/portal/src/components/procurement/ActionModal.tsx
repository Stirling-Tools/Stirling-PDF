import { useRef, useState } from "react";
import { Button, Modal } from "@shared/components";
import type { LedgerDoc } from "@portal/api/procurement";
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
function actionCopy(doc: LedgerDoc): ActionCopy {
  const fee = doc.fee !== undefined ? ` · ${USD.format(doc.fee)}` : "";
  switch (doc.action) {
    case "sign":
      return {
        title: "Review and sign your agreement",
        subtitle: doc.name,
        body: "Opens the Stirling Enterprise Agreement for e-signature — one signature covers the MSA, order form, EULA and DPA. We countersign automatically and you advance to payment.",
        cta: "Open for signature",
      };
    case "pay":
      return {
        title: "Confirm payment",
        subtitle: doc.name,
        body: "Pay your committed contract by card or bank transfer through Stripe. Your workspace provisions as soon as payment clears.",
        cta: "Continue to Stripe",
      };
    case "upload":
      return {
        title: "Upload your purchase order",
        subtitle: doc.name,
        body: "Send us your PO and we invoice against it on your terms. Drag in the PDF or pick a file below.",
        cta: "Upload purchase order",
      };
    case "request":
      return {
        title: "Request this document",
        subtitle: doc.name,
        body: doc.fee
          ? "This is a paid add-on. Confirm and your solutions engineer will scope it and send the paperwork."
          : "We generate this on demand. Confirm and your solutions engineer will send it across shortly.",
        cta: `Request${fee}`,
      };
    default:
      return {
        title: "Download",
        subtitle: doc.name,
        body: "Your download will begin shortly.",
        cta: "Download",
      };
  }
}

/**
 * Confirmation modal for a document's gating action. The action stubs resolve
 * locally (no commercial backend yet); the modal owns the in-flight state and
 * hands control back to the caller on success.
 */
export function ActionModal({
  doc,
  onClose,
  onDone,
}: {
  doc: LedgerDoc | null;
  onClose: () => void;
  onDone: (doc: LedgerDoc) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  if (!doc) return null;
  const copy = actionCopy(doc);
  const needsFile = doc.action === "upload";

  async function submit() {
    if (!doc) return;
    setSubmitting(true);
    try {
      switch (doc.action) {
        case "sign":
          await signAgreement(doc.id);
          break;
        case "pay":
          await payOnline();
          break;
        case "upload":
          if (file) await uploadPurchaseOrder(file);
          break;
        case "request":
          await requestDocument(doc.id, doc.action);
          break;
        default:
          // download is fire-and-forget; nothing to await.
          break;
      }
      onDone(doc);
      setFile(null);
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
            Cancel
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
            Choose file
          </Button>
          <span className="portal-proc__upload-name">
            {file ? file.name : "No file selected"}
          </span>
        </div>
      )}
    </Modal>
  );
}
