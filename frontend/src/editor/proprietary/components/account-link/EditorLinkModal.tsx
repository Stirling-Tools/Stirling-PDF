import { LinkAccountModal } from "@processor/components/account-link/LinkAccountModal";
import type { ExhaustedAccountLinkModalProps } from "@editor/components/account-link/ExhaustedAccountLinkModal";

/** The browser editor starts the existing account-link flow without leaving the document. */
export function EditorLinkModal({
  open,
  onClose,
  summary,
  failureContext,
}: ExhaustedAccountLinkModalProps) {
  return (
    <LinkAccountModal
      open={open}
      onClose={onClose}
      summary={summary}
      failureContext={failureContext}
      mode="exhausted"
    />
  );
}
