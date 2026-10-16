import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Banner, Button, Skeleton } from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { KvRow } from "@app/billing/KvRow";
import { formatPeriodDate } from "@app/billing/format";
import { fetchCloudPlan } from "@portal/api/link";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";
import { qk } from "@portal/queries/keys";
import { cloudUrl } from "@portal/components/account-link/cloudLinks";
import { AccountConnectionNotice } from "@portal/components/account-link/AccountConnectionNotice";
import "@app/billing/billing-screen.css";

/**
 * Usage & Billing for a server linked with a key. Whoever runs the server may never have signed in
 * to Stirling Cloud, so this page reads only what the server already caches with its own
 * credential and sends every change to stirling.com.
 */
export function CloudManagedPlanView({
  licenseSection,
}: {
  licenseSection?: ReactNode;
}) {
  const { t } = useTranslation();
  const applyLinkFacts = useApplyLinkFacts();
  const plan = useQuery({
    queryKey: qk.cloudPlan(),
    queryFn: fetchCloudPlan,
    refetchInterval: 60_000,
    retry: false,
  });
  const billingUrl = cloudUrl("/settings/billing");
  const data = plan.data;

  // The tier everywhere else reads from the wallet, which a key-linked server cannot load.
  useEffect(() => {
    if (data?.known) applyLinkFacts(true, data.subscribed);
  }, [applyLinkFacts, data?.known, data?.subscribed]);

  const used = data ? data.periodSpendUnits + data.unsyncedUnits : 0;
  const credits = (n: number) =>
    t("portal.billing.cloudManaged.credits", "{{amount}} credits", {
      amount: n.toLocaleString(),
    });

  return (
    <div className="billing-page">
      <div className="billing-page__head">
        <div>
          <h1 className="billing-page__title">
            {t("portal.usage.title", "Usage & Billing")}
          </h1>
          <p className="billing-page__subtitle">
            {t(
              "portal.billing.cloudManaged.subtitle",
              "Your plan and usage. Billing is managed in Stirling Cloud.",
            )}
          </p>
        </div>
        {billingUrl && (
          <Button
            as="a"
            href={billingUrl}
            target="_blank"
            rel="noopener noreferrer"
            rightSection={<Icon name="external-link" size={20} />}
          >
            {t(
              "portal.billing.cloudManaged.manage",
              "Manage billing on stirling.com",
            )}
          </Button>
        )}
      </div>

      <div className="billing-page__body">
        <div className="billing-page__notices">
          <AccountConnectionNotice />
          <Banner
            tone="info"
            title={t(
              "portal.billing.cloudManaged.noticeTitle",
              "Billing is managed in Stirling Cloud",
            )}
          >
            {t(
              "portal.billing.cloudManaged.noticeBody",
              "This server was connected with a link key. Your Stirling Cloud team changes the plan, payment details and spend limit on stirling.com.",
            )}
          </Banner>
          {data?.state === "OVER_LIMIT" && (
            <Banner
              tone="warning"
              title={t(
                "portal.billing.cloudManaged.limitTitle",
                "Spend limit reached",
              )}
            >
              {t(
                "portal.billing.cloudManaged.limitBody",
                "Metered processing is paused until your Stirling Cloud team raises the limit on stirling.com.",
              )}
            </Banner>
          )}
          {plan.isError && (
            <Banner
              tone="danger"
              title={t(
                "portal.billing.cloudManaged.loadError",
                "Couldn’t load this server’s plan",
              )}
            />
          )}
        </div>

        {plan.isPending ? (
          <div aria-hidden>
            <Skeleton height="12rem" />
          </div>
        ) : (
          <div className="billing-card">
            {data && (
              <section id="ub-plan" className="billing-sec">
                <span className="billing-eyebrow">
                  {t("portal.billing.section.plan", "Your plan")}
                </span>
                {data.known ? (
                  <>
                    <div className="billing-id">
                      <span className="billing-id__name">
                        {data.subscribed
                          ? t(
                              "portal.billing.identity.processor.name",
                              "Processor",
                            )
                          : t("portal.billing.identity.free.name", "Free")}
                      </span>
                    </div>
                    <KvRow
                      label={t(
                        "portal.billing.cloudManaged.used",
                        "Credits used this period",
                      )}
                      value={used.toLocaleString()}
                      note={
                        data.unsyncedUnits > 0
                          ? t(
                              "portal.billing.cloudManaged.unsynced",
                              "{{amount}} not yet synced",
                              { amount: data.unsyncedUnits.toLocaleString() },
                            )
                          : undefined
                      }
                    />
                    <KvRow
                      label={t(
                        "portal.billing.cloudManaged.limit",
                        "Spend limit",
                      )}
                      value={
                        data.periodCapUnits == null
                          ? t("portal.billing.cloudManaged.noLimit", "No limit")
                          : credits(data.periodCapUnits)
                      }
                    />
                    <KvRow
                      label={t(
                        "portal.billing.cloudManaged.freeLeft",
                        "Free credits left",
                      )}
                      value={data.freeRemainingUnits.toLocaleString()}
                    />
                    {data.prepaidRemainingUnits > 0 && (
                      <KvRow
                        label={t(
                          "portal.billing.cloudManaged.prepaidLeft",
                          "Prepaid credits left",
                        )}
                        value={data.prepaidRemainingUnits.toLocaleString()}
                      />
                    )}
                    {data.licensedUsers != null && (
                      <KvRow
                        label={t(
                          "portal.billing.cloudManaged.users",
                          "Team plan users",
                        )}
                        value={data.licensedUsers.toLocaleString()}
                      />
                    )}
                    {data.periodEnd && (
                      <KvRow
                        label={t(
                          "portal.billing.cloudManaged.periodEnds",
                          "Period ends",
                        )}
                        value={formatPeriodDate(data.periodEnd, {
                          year: true,
                        })}
                      />
                    )}
                  </>
                ) : (
                  <p className="billing-id__sub">
                    {t(
                      "portal.billing.cloudManaged.waiting",
                      "Plan details appear once this server has checked in with Stirling Cloud.",
                    )}
                  </p>
                )}
              </section>
            )}
            {licenseSection && (
              <section
                id="ub-license"
                className="billing-sec billing-sec--license"
                aria-label={t(
                  "admin.settings.premium.inputMethod.text",
                  "License Key",
                )}
              >
                {licenseSection}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
