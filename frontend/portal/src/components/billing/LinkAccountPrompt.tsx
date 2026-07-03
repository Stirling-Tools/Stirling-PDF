import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState } from "@shared/components";
import { useUI } from "@portal/contexts/UIContext";

/**
 * Unlinked state — the billing page asks the admin to link their Stirling
 * account to claim the 500-PDF free grant. The CTA opens the login modal
 * directly (no detour through Settings).
 */
export function LinkAccountPrompt() {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  return (
    <Card padding="loose">
      <EmptyState
        size="default"
        title={t("billing.linkPrompt.title", "Link your Stirling account")}
        description={t(
          "billing.linkPrompt.description",
          "Manual PDF editing — view, sign, merge, split, watermark, compress, convert, manual OCR — is always free, linked or not. Link to claim 500 free PDFs of metered processing (automation, AI, and the API); when you need more, turn on the Processor plan and only pay for what you use.",
        )}
        actions={
          <Button variant="gradient" onClick={() => openLinkModal()}>
            {t("billing.linkPrompt.cta", "Link Stirling account")}
          </Button>
        }
      />
    </Card>
  );
}
