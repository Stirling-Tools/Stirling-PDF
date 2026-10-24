import { useTranslation } from "react-i18next";
import { useAuth } from "@editor/auth";
import { Button } from "@editor/ui";
import { formatPeriodDate } from "@editor/billing";
import { useAccountLinkBlock } from "@editor/services/accountLinkBlock";
import { useFreeTierBalance } from "@processor/hooks/useFreeTierBalance";
import { useLinkOptional } from "@processor/contexts/LinkContext";
import { useUI } from "@processor/contexts/UIContext";
import "@processor/components/ConnectAccountRail.css";

/** The exhausted allowance stays actionable across Processor routes, even after the dialog closes. */
export function ConnectAccountRail() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const link = useLinkOptional();
  const { openLinkModal } = useUI();
  const { exhausted } = useAccountLinkBlock();
  const { data: balance } = useFreeTierBalance();
  if (!link || link.isLinked || (!exhausted && balance?.remainingUnits !== 0))
    return null;
  const resets = balance ? formatPeriodDate(balance.periodEnd) : null;

  return (
    <section className="portal-connect-rail" role="status">
      <div className="portal-connect-rail__text">
        <b className="portal-connect-rail__title">
          {t(
            "portal.accountLink.rail.exhaustedTitle",
            "This server’s free credits are used up",
          )}
        </b>
        <span className="portal-connect-rail__sub">
          {isAdmin
            ? t(
                "portal.accountLink.rail.exhaustedSub",
                "Link for monthly credits, shared billing and the option to grow with a Team plan.",
              )
            : t(
                "portal.accountLink.rail.adminSub",
                "Ask your server administrator to link a Stirling account for more credits. Manual PDF tools are still available.",
              )}
          {resets && (
            <>
              {" "}
              {t("portal.usage.freeTier.resets", "Resets {{date}}", {
                date: resets,
              })}
              .
            </>
          )}
        </span>
      </div>
      <div className="portal-connect-rail__actions">
        <Button variant="primary" onClick={() => openLinkModal("exhausted")}>
          {isAdmin
            ? t(
                "portal.accountLink.rail.exhaustedCta",
                "Link account for more credits",
              )
            : t("portal.accountLink.rail.adminCta", "How to get more credits")}
        </Button>
      </div>
    </section>
  );
}
