import { useTranslation } from "react-i18next";
import "@processor/components/account-link/connect/connect.css";

/**
 * Processor is one row naming its parts rather than four competing ones, and credits come last:
 * first, and the screen reads as a price list.
 *
 * <p>TODO(#7712): the credits row promises a monthly allowance the billing model does not grant —
 * {@code freeGrantUnits} is a one-time lifetime pool — so either the grant becomes recurring or the
 * copy drops "per month" before this reaches customers.
 */
export function ConnectBenefitsSlide() {
  const { t } = useTranslation();

  const unlocks: { key: string; label: string; detail: string }[] = [
    {
      key: "processor",
      label: t(
        "processor.accountLink.connect.benefits.processorLabel",
        "Processor",
      ),
      detail: t(
        "processor.accountLink.connect.benefits.processorDetail",
        "Pipelines, policies, sources and audit",
      ),
    },
    {
      key: "teams",
      label: t("processor.accountLink.connect.benefits.teamsLabel", "Teams"),
      detail: t(
        "processor.accountLink.connect.benefits.teamsDetail",
        "Free for up to 5 users",
      ),
    },
    {
      key: "credits",
      label: t(
        "processor.accountLink.connect.benefits.creditsLabel",
        "Credits",
      ),
      detail: t(
        "processor.accountLink.connect.benefits.creditsDetail",
        "500 free per month",
      ),
    },
  ];

  return (
    <dl className="processor-connect__list">
      {unlocks.map((unlock) => (
        <div className="processor-connect__row" key={unlock.key}>
          <dt className="processor-connect__row-label">{unlock.label}</dt>
          <dd className="processor-connect__row-detail">{unlock.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
