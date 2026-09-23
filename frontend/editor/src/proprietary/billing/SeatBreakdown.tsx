import { useTranslation } from "react-i18next";
import type { TeamHolding } from "@app/billing/types";

/** Shows report freshness; only this deployment can substitute a live local count. */
export function SeatBreakdown({
  breakdown,
  deviceId,
  localUsers,
}: {
  breakdown: NonNullable<TeamHolding["breakdown"]>;
  deviceId?: string | null;
  localUsers?: number | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="billing-breakdown">
      <strong>
        {t("portal.billing.seats.breakdown", "Where users are counted")}
      </strong>
      <div className="billing-breakdown__row">
        <span>{t("portal.billing.seats.cloud", "Stirling Cloud")}</span>
        <strong>{breakdown.cloudUsers.toLocaleString()}</strong>
      </div>
      {breakdown.excludedOwners > 0 && (
        <small>
          {t(
            "portal.billing.seats.ownerExcluded",
            "The required cloud team owner does not use a seat.",
          )}
        </small>
      )}
      {breakdown.deployments.map((deployment) => {
        const current = deployment.deviceId === deviceId;
        const live = current && localUsers != null;
        const count = live ? localUsers : deployment.users;
        return (
          <div key={deployment.deviceId}>
            <div className="billing-breakdown__row">
              <span>
                {current
                  ? t("portal.billing.seats.thisServer", "This server")
                  : deployment.name ||
                    t("portal.billing.seats.deployment", "Linked server")}
              </span>
              <strong>
                {count == null
                  ? t("portal.billing.seats.notReported", "Not yet reported")
                  : count.toLocaleString()}
              </strong>
            </div>
            <small>
              {live
                ? t("portal.billing.seats.live", "Live user count")
                : deployment.reportedAt
                  ? t(
                      "portal.billing.seats.lastReported",
                      "Reported {{date}}",
                      {
                        date: new Date(deployment.reportedAt).toLocaleString(),
                      },
                    )
                  : t(
                      "portal.billing.seats.awaitingSync",
                      "Waiting for its daily sync; not yet included in the fleet total.",
                    )}
            </small>
          </div>
        );
      })}
    </div>
  );
}
