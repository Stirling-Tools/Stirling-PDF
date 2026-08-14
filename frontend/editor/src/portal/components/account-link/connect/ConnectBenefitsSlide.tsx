import { useTranslation } from "react-i18next";
import "@portal/components/account-link/connect/connect.css";

/**
 * Step 1 of the Connect flow: what connecting a Stirling account gets you.
 *
 * <p>The step this flow was missing. Before it, the only thing an admin ever saw was a login form
 * subtitled "the account this server should bill against", which frames connecting as the moment
 * they start paying rather than what they gain.
 *
 * <p>Names what you get rather than selling it. The Processor owns pipelines, policies, sources and
 * audit, so it is one row naming its parts rather than four competing ones. Credits come last: put
 * them first and the whole screen reads as a price list.
 */
export function ConnectBenefitsSlide() {
  const { t } = useTranslation();

  const unlocks: { key: string; label: string; detail: string }[] = [
    {
      key: "processor",
      label: t(
        "portal.accountLink.connect.benefits.processorLabel",
        "Processor",
      ),
      detail: t(
        "portal.accountLink.connect.benefits.processorDetail",
        "Pipelines, policies, sources and audit",
      ),
    },
    {
      key: "teams",
      label: t("portal.accountLink.connect.benefits.teamsLabel", "Teams"),
      detail: t(
        "portal.accountLink.connect.benefits.teamsDetail",
        "Free for 5 users and under",
      ),
    },
    {
      key: "credits",
      label: t("portal.accountLink.connect.benefits.creditsLabel", "Credits"),
      detail: t(
        "portal.accountLink.connect.benefits.creditsDetail",
        "500 free on a new account",
      ),
    },
  ];

  return (
    <dl className="portal-connect__list">
      {unlocks.map((unlock) => (
        <div className="portal-connect__row" key={unlock.key}>
          <dt className="portal-connect__row-label">{unlock.label}</dt>
          <dd className="portal-connect__row-detail">{unlock.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
