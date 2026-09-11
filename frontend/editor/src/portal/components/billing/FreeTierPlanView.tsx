import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Card, Skeleton } from "@app/ui";
import { formatPeriodDate, MeterBar, remainingMeter } from "@app/billing";
import { fetchFreeTier, type FreeTierBalance } from "@portal/api/link";
import { HttpError } from "@portal/api/http";
import { useUI } from "@portal/contexts/UIContext";
import "@app/billing/billing-screen.css";
import { FreePdfEditorsCard } from "@portal/components/billing/FreePdfEditorsCard";

/** {@code forbidden} is an outcome, not a failure: the endpoint is admin-only. */
type Load =
  | { state: "loading" }
  | { state: "ready"; balance: FreeTierBalance }
  | { state: "forbidden" }
  | { state: "failed" };

/**
 * Usage & billing for an instance with no Stirling account. Reads the local endpoint only: loading
 * a wallet here would assert linkage the browser's SaaS session cannot vouch for.
 */
export function FreeTierPlanView({
  licenseSection,
}: {
  licenseSection?: ReactNode;
}) {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  // An outcome, not a rendered message: the effect must not depend on `t`, whose identity is
  // not stable across renders.
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchFreeTier()
      .then((balance) => {
        if (!cancelled) setLoad({ state: "ready", balance });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const denied =
          e instanceof HttpError && (e.status === 401 || e.status === 403);
        setLoad({ state: denied ? "forbidden" : "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="portal-usage portal-billing">
      <header className="portal-usage__header">
        <div className="portal-usage__header-inner">
          <div>
            <h1 className="portal-usage__title">
              {t("portal.usage.title", "Usage & billing")}
            </h1>
            <p className="portal-usage__subtitle">
              {t(
                "portal.usage.freeTier.subtitle",
                "What this server has processed against its monthly credits.",
              )}
            </p>
          </div>
          <Button variant="secondary" fat onClick={() => openLinkModal()}>
            {t("portal.usage.freeTier.connect", "Connect a Stirling account")}
          </Button>
        </div>
      </header>

      <div className="portal-usage__body">
        {load.state === "loading" && (
          <div className="portal-billing__skeleton" aria-hidden>
            <Skeleton height="10rem" />
            <Skeleton height="14rem" />
          </div>
        )}

        {load.state === "failed" && (
          <Banner
            tone="danger"
            title={t(
              "portal.usage.freeTier.loadErrorTitle",
              "Couldn't load credit usage",
            )}
          >
            {t(
              "portal.usage.freeTier.loadError",
              "Couldn't read this server's credit usage. Try again in a moment.",
            )}
          </Banner>
        )}

        {load.state !== "loading" && <FreePdfEditorsCard />}

        {load.state === "forbidden" && (
          <Card padding="loose">
            <p className="portal-billing__section-sub">
              {t(
                "portal.usage.freeTier.adminOnly",
                "This server's monthly credits are shared by everyone on it, so only an administrator can see the figures. Everything you can run stays available.",
              )}
            </p>
          </Card>
        )}

        {load.state === "ready" && <FreeTierMeter balance={load.balance} />}
        {licenseSection && <Card padding="loose">{licenseSection}</Card>}
      </div>
    </div>
  );
}

function FreeTierMeter({ balance }: { balance: FreeTierBalance }) {
  const { t } = useTranslation();
  const { state, pct } = remainingMeter(
    balance.remainingUnits,
    balance.grantUnits,
  );
  const resets = formatPeriodDate(balance.periodEnd);

  return (
    <Card padding="loose">
      <div className="portal-billing__subscription-head">
        <div>
          <h2 className="portal-billing__meter-title">
            {t(
              "portal.usage.freeTier.title",
              "{{allowance}} free credits every month",
              {
                count: balance.grantUnits,
                allowance: balance.grantUnits.toLocaleString(),
              },
            )}
          </h2>
        </div>
      </div>
      <div className="portal-billing__trial-meter">
        <MeterBar
          state={state}
          pct={pct}
          barLabel={t(
            "portal.usage.freeTier.barAria",
            "Free credits remaining",
          )}
          figure={balance.remainingUnits.toLocaleString()}
          capSuffix={t(
            "portal.usage.freeTier.capSuffix",
            "of {{allowance}} free credits left this month",
            {
              count: balance.grantUnits,
              allowance: balance.grantUnits.toLocaleString(),
            },
          )}
          statusLabel={t("portal.usage.freeTier.statusLabel", "{{used}} used", {
            count: balance.usedUnits,
            used: balance.usedUnits.toLocaleString(),
          })}
          meta={
            resets
              ? t("portal.usage.freeTier.resets", "Resets {{date}}", {
                  date: resets,
                })
              : null
          }
        />
      </div>
    </Card>
  );
}
