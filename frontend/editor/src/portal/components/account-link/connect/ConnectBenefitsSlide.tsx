import { useTranslation } from "react-i18next";
import "@portal/components/account-link/connect/connect.css";

/**
 * Step 1 of the connect flow: the case for linking.
 *
 * <p>Leads with what the admin gains. A login form subtitled "the account this server should bill
 * against" frames connecting as the moment they start paying, which is the opposite of the reason
 * to do it.
 *
 * <p>The Processor is one row naming its parts rather than four rows competing with each other, and
 * credits come last: put them first and the screen reads as a price list.
 *
 * <p>Nothing about the mechanics. The next step is one click away and the progress bar already says
 * there is more of it.
 *
 * <p>TODO(#7712): the credits row promises a monthly allowance the billing model does not grant.
 * {@code freeGrantUnits} is a one-time lifetime pool seeded at team creation, so either the grant
 * becomes recurring or the copy drops "per month" before this reaches customers.
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
