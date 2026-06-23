import type { ReactNode } from "react";
import { Banner, Button } from "@shared/components";
import { useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";

interface Props {
  /** The billable feature — rendered only when the org is linked. */
  children: ReactNode;
  /** Feature name for the lock copy, e.g. "AI extraction". */
  feature?: string;
}

/**
 * Gates billable features on the account-link state. When the org is unlinked it
 * renders a "link to unlock" prompt instead of the feature; once linked (free or
 * subscribed) the children render. Drop this around any surface that should only
 * work against a linked SaaS wallet.
 */
export function LinkGate({ children, feature }: Props) {
  const { featuresUnlocked } = useLink();
  const { openSettings } = useUI();

  if (featuresUnlocked) return <>{children}</>;

  return (
    <Banner
      tone="info"
      title={feature ? `Link to unlock ${feature}` : "Link to unlock"}
      description="Link this org's Stirling account to use billable features."
      action={
        <Button size="sm" onClick={() => openSettings("account-link")}>
          Link account
        </Button>
      }
    />
  );
}
