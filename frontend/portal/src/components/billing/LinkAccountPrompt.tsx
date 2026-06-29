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
        title={t("billing.linkPrompt.title")}
        description={t("billing.linkPrompt.description")}
        actions={
          <Button variant="gradient" onClick={() => openLinkModal()}>
            {t("billing.linkPrompt.cta")}
          </Button>
        }
      />
    </Card>
  );
}
