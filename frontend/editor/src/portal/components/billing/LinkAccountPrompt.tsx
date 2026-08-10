import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState } from "@app/ui";
import { useUI } from "@portal/contexts/UIContext";

/**
 * Unlinked state on the billing page. The CTA opens the Connect flow directly, so the admin gets
 * the full case for connecting rather than a bare login box.
 *
 * <p>The copy states the free grant as a property of a new account, not as a reward for connecting:
 * the allowance is seeded per team at team creation, so an existing account that has spent it gains
 * nothing by linking.
 */
export function LinkAccountPrompt() {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  return (
    <Card padding="loose">
      <EmptyState
        size="default"
        title={t(
          "portal.billing.linkPrompt.title",
          "Connect your Stirling account",
        )}
        description={t(
          "portal.billing.linkPrompt.description",
          "Manual PDF editing is always free, connected or not. Connecting adds teams, the processor, pipelines and policies, and a new Stirling account starts with 500 free credits for automation, AI and the API.",
        )}
        actions={
          <Button variant="primary" onClick={() => openLinkModal()}>
            {t("portal.billing.linkPrompt.cta", "Connect account")}
          </Button>
        }
      />
    </Card>
  );
}
