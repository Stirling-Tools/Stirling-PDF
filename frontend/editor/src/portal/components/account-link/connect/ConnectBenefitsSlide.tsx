import { useTranslation } from "react-i18next";
import "@portal/components/account-link/connect/connect.css";

/**
 * Step 1 of the connect flow: what connecting a Stirling account gets you.
 *
 * <p>The step this flow was missing. Before it, the only thing an admin ever saw was a login form
 * subtitled "the account this server should bill against", which frames connecting as the moment
 * they start paying rather than what they gain.
 *
 * <p>Names what you get rather than selling it. The Processor owns pipelines, policies, sources and
 * audit, so it is one row naming its parts rather than four competing ones. Credits come last: put
 * them first and the whole screen reads as a price list.
 *
 * <p>Nothing about the mechanics. What happens next is one click away and the progress bar already
 * says there is more of it, so explaining the redirect here only gave the admin something to read
 * past.
 *
 * <p>The credits line promises a <b>monthly</b> allowance, which the billing model does not grant
 * yet: {@code freeGrantUnits} is a one-time lifetime pool seeded at team creation. Copy leading
 * implementation is deliberate here, but it is a claim about money, so it needs the recurring grant
 * to land before this ships to customers.
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
        "Free for up to 5 users",
      ),
    },
    {
      key: "credits",
      label: t("portal.accountLink.connect.benefits.creditsLabel", "Credits"),
      detail: t(
        "portal.accountLink.connect.benefits.creditsDetail",
        "500 free per month",
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
