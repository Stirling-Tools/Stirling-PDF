import { Button, Card, EmptyState } from "@shared/components";
import { useUI } from "@portal/contexts/UIContext";

/**
 * Unlinked state — the billing page asks the admin to link their Stirling
 * account to claim the 500-PDF free grant. The CTA opens the Settings modal at
 * the Account Link panel, where the actual link flow lives.
 */
export function LinkAccountPrompt() {
  const { openSettings } = useUI();
  return (
    <Card padding="loose">
      <EmptyState
        size="default"
        title="Link your Stirling account"
        description="Link to unlock the full Editor plan — 500 free PDFs across automation, AI, and the API. Manual PDF editing stays free forever, no matter what. When you need more, turn on the Processor plan and only pay for what you use."
        actions={
          <Button variant="gradient" onClick={() => openSettings()}>
            Link Stirling account
          </Button>
        }
      />
    </Card>
  );
}
