import { useTranslation } from "react-i18next";
import "@app/components/account-link/connect.css";

/** Linking benefits distinguish the free team allowance from optional paid capacity. */
export function ConnectBenefitsSlide() {
  const { t } = useTranslation();
  const benefits = [
    {
      key: "credits",
      label: t(
        "portal.accountLink.connect.benefits.creditsLabel",
        "Monthly credits",
      ),
      detail: t(
        "portal.accountLink.connect.benefits.creditsDetail",
        "Access your team’s free monthly allowance",
      ),
    },
    {
      key: "teams",
      label: t(
        "portal.accountLink.connect.benefits.teamsLabel",
        "Larger teams",
      ),
      detail: t(
        "portal.accountLink.connect.benefits.teamsDetail",
        "Add more users with a paid Team plan",
      ),
    },
    {
      key: "processing",
      label: t(
        "portal.accountLink.connect.benefits.processingLabel",
        "More processing",
      ),
      detail: t(
        "portal.accountLink.connect.benefits.processingDetail",
        "Buy more credits for API, AI and automation as you grow",
      ),
    },
    {
      key: "billing",
      label: t(
        "portal.accountLink.connect.benefits.billingLabel",
        "One account",
      ),
      detail: t(
        "portal.accountLink.connect.benefits.billingDetail",
        "Manage usage, billing and linked servers together",
      ),
    },
  ];

  return (
    <dl className="portal-connect__list">
      {benefits.map((benefit) => (
        <div className="portal-connect__row" key={benefit.key}>
          <dt className="portal-connect__row-label">{benefit.label}</dt>
          <dd className="portal-connect__row-detail">{benefit.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
