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
        description="Linking unlocks 500 free PDFs across automation, AI, and the API. Manual editing stays free always. Subscribe to Pay-as-you-go to keep going past the free grant — set a monthly cap, stay in control."
        actions={
          <Button variant="gradient" onClick={() => openSettings()}>
            Link Stirling account
          </Button>
        }
      />
    </Card>
  );
}
