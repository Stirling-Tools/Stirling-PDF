import i18n from "i18next";
import { inspectLocalPdfAccess } from "@editor/services/pdfAccessService";
import {
  getOpenedRightsManagedPdf,
  isKnownRightsManagedPdf,
  type OpenedRightsManagedPdf,
} from "@editor/services/rightsManagedPdf";
import { toolIOFor } from "@editor/types/toolIO";

export type RightsManagedToolRule =
  | { supported: true; needsCopy: boolean }
  | { supported: false; reason: string };

const cannotKeepProtection = () =>
  i18n.t(
    "rightsManagedPdf.toolUnsupported",
    "This tool cannot keep Microsoft Purview protection yet.",
  );

const managedByLabel = () =>
  i18n.t(
    "rightsManagedPdf.managedByLabel",
    "Microsoft Purview protection comes from the file's sensitivity label, so this tool can't change it.",
  );

const signingUnsupported = () =>
  i18n.t(
    "rightsManagedPdf.signingUnsupported",
    "Microsoft Purview can't protect a digitally signed PDF, so signing tools can't be used on protected files.",
  );

const sendsToAi = () =>
  i18n.t(
    "rightsManagedPdf.sendsToAi",
    "This tool would send the protected content to the AI engine, so it isn't available for Microsoft Purview protected PDFs.",
  );

const holdsPayload = () =>
  i18n.t(
    "rightsManagedPdf.holdsPayload",
    "Microsoft Purview keeps the protected document in the file's attachments, so attachment tools can't be used on it.",
  );

const readsStoredFile = () =>
  i18n.t(
    "rightsManagedPdf.readsStoredFile",
    "This tool can't read the content of Microsoft Purview protected PDFs yet.",
  );

const forbidsEncryption = () =>
  i18n.t(
    "rightsManagedPdf.forbidsEncryption",
    "PDF/A and PDF/X don't allow encryption, so the result couldn't keep Microsoft Purview protection.",
  );

const EXCLUDED = new Map<string, () => string>([
  ["/api/v1/security/add-password", managedByLabel],
  ["/api/v1/security/remove-password", managedByLabel],
  ["/api/v1/integration/purview-apply-label", managedByLabel],
  ["/api/v1/integration/purview-read-label", managedByLabel],
  ["/api/v1/security/cert-sign", signingUnsupported],
  ["/api/v1/security/timestamp-pdf", signingUnsupported],
  ["/api/v1/security/remove-cert-sign", signingUnsupported],
  ["/api/v1/ai/tools/classify-and-label", sendsToAi],
  ["/api/v1/docparse/ingest", sendsToAi],
  ["/api/v1/form/form-detection/detect", sendsToAi],
  ["/api/v1/misc/add-attachments", holdsPayload],
  ["/api/v1/misc/batch-process-attachments", holdsPayload],
  ["/api/v1/misc/delete-attachment", holdsPayload],
  ["/api/v1/misc/rename-attachment", holdsPayload],
  ["/api/v1/general/edit-table-of-contents", readsStoredFile],
  ["/api/v1/general/overlay-pdfs", readsStoredFile],
  ["/api/v1/convert/pdf/ua", readsStoredFile],
  ["/api/v1/convert/pdf/pdfa", forbidsEncryption],
]);

const NEEDS_COPY = new Set([
  "/api/v1/misc/auto-rename",
  "/api/v1/general/split-pdf-by-chapters",
]);

export function rightsManagedToolRule(
  endpoint: string | undefined,
): RightsManagedToolRule {
  const excluded = endpoint ? EXCLUDED.get(endpoint) : undefined;
  if (excluded) return { supported: false, reason: excluded() };
  const spec = endpoint ? toolIOFor(endpoint) : undefined;
  if (!endpoint || !spec?.accepts.includes("PDF"))
    return { supported: false, reason: cannotKeepProtection() };
  if (spec.produces !== "PDF")
    return {
      supported: false,
      reason: i18n.t(
        "rightsManagedPdf.outputNotPdf",
        "This tool doesn't make PDFs, so its results couldn't keep Microsoft Purview protection.",
      ),
    };
  return { supported: true, needsCopy: NEEDS_COPY.has(endpoint) };
}

const editNotAllowed = () =>
  i18n.t(
    "rightsManagedPdf.editNotAllowed",
    "Your permissions on this protected PDF do not allow changes.",
  );

const copyNotAllowed = () =>
  i18n.t(
    "rightsManagedPdf.copyNotAllowed",
    "Your permissions on this protected PDF do not allow copying its content, which this tool needs.",
  );

function missingRight(
  rule: RightsManagedToolRule,
  opened: OpenedRightsManagedPdf,
): string | undefined {
  if (!rule.supported) return rule.reason;
  const { edit, copy } = opened.protection.permissions;
  if (!edit) return editNotAllowed();
  if (rule.needsCopy && !copy) return copyNotAllowed();
  return undefined;
}

export function rightsManagedToolBlockReason(
  endpoint: string | undefined,
  fileId: string,
): string | undefined {
  if (!isKnownRightsManagedPdf(fileId)) return undefined;
  const rule = rightsManagedToolRule(endpoint);
  if (!rule.supported) return rule.reason;
  const opened = getOpenedRightsManagedPdf(fileId);
  return opened ? missingRight(rule, opened) : undefined;
}

export function rightsManagedToolAccepts(
  endpoint: string | undefined,
  fileId: string,
): boolean {
  return rightsManagedToolBlockReason(endpoint, fileId) === undefined;
}

const signedContent = new WeakMap<OpenedRightsManagedPdf, Promise<boolean>>();

function hasSignatures(opened: OpenedRightsManagedPdf): Promise<boolean> {
  let signed = signedContent.get(opened);
  if (!signed) {
    signed = inspectLocalPdfAccess(opened.plaintext).then(
      (access) => access.signed,
      () => {
        signedContent.delete(opened);
        return false;
      },
    );
    signedContent.set(opened, signed);
  }
  return signed;
}

export async function assertRightsManagedRun(
  opened: OpenedRightsManagedPdf,
  endpoint: string | undefined,
): Promise<void> {
  const missing = missingRight(rightsManagedToolRule(endpoint), opened);
  if (missing) throw new Error(missing);
  if (await hasSignatures(opened))
    throw new Error(
      i18n.t(
        "rightsManagedPdf.signedReadOnly",
        "This protected PDF has digital signatures that any change would break, so it can only be viewed.",
      ),
    );
}

export function rightsManagedWithPasswordError(): Error {
  return new Error(
    i18n.t(
      "rightsManagedPdf.mixedWithPassword",
      "A Microsoft Purview protected PDF can't be combined with a password-protected PDF, because the result can only keep one kind of protection.",
    ),
  );
}
