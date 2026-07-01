import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { featuresUnlocked } = useLink();
  const { openLinkModal } = useUI();

  if (featuresUnlocked) return <>{children}</>;

  return (
    <Banner
      tone="info"
      title={
        feature
          ? t("accountLink.gate.titleFeature", "Link to unlock {{feature}}", {
              feature,
            })
          : t("accountLink.gate.title", "Link to unlock")
      }
      description={t(
        "accountLink.gate.description",
        "Link this org's Stirling account to use billable features.",
      )}
      action={
        <Button size="sm" onClick={() => openLinkModal()}>
          {t("accountLink.gate.action", "Link account")}
        </Button>
      }
    />
  );
}
