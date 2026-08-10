import { useTranslation } from "react-i18next";
import "@portal/components/account-link/connect/connect.css";

/**
 * Step 1 of the Connect flow: what linking a Stirling account actually gets you.
 *
 * <p>The step this flow was missing. Before it, the only thing an admin ever saw was a login form
 * subtitled "the account this server should bill against", which frames linking as the moment they
 * start paying rather than what they gain.
 *
 * <p>Two copy constraints are load-bearing. The free grant is seeded per team at team creation and
 * is NOT granted by linking, so the allowance is stated as a property of a new account rather than
 * a reward for connecting. Teams are free at five users and under, matching the free tier limit the
 * server already reports, because an unqualified "free" breaks on the sixth invite.
 */
export function ConnectBenefitsSlide() {
  const { t } = useTranslation();

  const benefits: { key: string; label: string; detail: string }[] = [
    {
      key: "credits",
      label: t("portal.accountLink.connect.benefits.creditsLabel", "Credits"),
      detail: t(
        "portal.accountLink.connect.benefits.creditsDetail",
        "500 free on a new account",
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
      key: "processor",
      label: t(
        "portal.accountLink.connect.benefits.processorLabel",
        "Processor",
      ),
      detail: t(
        "portal.accountLink.connect.benefits.processorDetail",
        "Watch folders and act on files",
      ),
    },
    {
      key: "pipelines",
      label: t(
        "portal.accountLink.connect.benefits.pipelinesLabel",
        "Pipelines",
      ),
      detail: t(
        "portal.accountLink.connect.benefits.pipelinesDetail",
        "Chain tools and run them unattended",
      ),
    },
    {
      key: "policies",
      label: t("portal.accountLink.connect.benefits.policiesLabel", "Policies"),
      detail: t(
        "portal.accountLink.connect.benefits.policiesDetail",
        "Rules that run on every file",
      ),
    },
    {
      key: "usage",
      label: t("portal.accountLink.connect.benefits.usageLabel", "Usage"),
      detail: t(
        "portal.accountLink.connect.benefits.usageDetail",
        "Pay only for what you run",
      ),
    },
  ];

  return (
    <>
      <p className="portal-connect__lede">
        {t(
          "portal.accountLink.connect.benefits.lede",
          "Connecting unlocks the platform features around the editor. Manual PDF editing stays free, connected or not.",
        )}
      </p>

      <dl className="portal-connect__list">
        {benefits.map((benefit) => (
          <div className="portal-connect__row" key={benefit.key}>
            <dt className="portal-connect__row-label">{benefit.label}</dt>
            <dd className="portal-connect__row-detail">{benefit.detail}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
