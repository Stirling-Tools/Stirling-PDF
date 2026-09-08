import { useTranslation } from "react-i18next";
import { Button, Card, StatusBadge } from "@app/ui";
import { MeterBar, meterState } from "@app/billing";
import type { Wallet } from "@portal/api/billing";

/**
 * The Team holding: paid user capacity, reported independently of the Processor.
 *
 * <p>Driven by the two facts the wallet reports about Team rather than by {@code wallet.status},
 * which collapses both products onto one free/subscribed axis and so cannot say which of them a
 * team holds. Three faces:
 *
 * <ul>
 *   <li>held, with a limit: the capacity meter, filling towards the licensed count
 *   <li>held, no limit: the member count with no denominator, for an unlimited entitlement
 *   <li>not held: the member count and what Team would add
 * </ul>
 *
 * <p>{@code usersInUse} is real on every face, so the meter always has a numerator and only its
 * denominator depends on the holding. No arithmetic is ever done against a missing limit:
 * {@code licensedUsers} is null for "no limit" and never a sentinel, so there is nothing to
 * accidentally divide by.
 *
 * <p>Over capacity is a state, not an error. A downgrade, a cancellation or a lapsed card can all
 * leave more members than the plan covers, and the roster is not retroactively cut, so the meter
 * reads full and says so instead of hiding the overage.
 */
export function TeamPlanCard({
  wallet,
  onBuy,
}: {
  wallet: Wallet;
  /** Leader-only: opens the Team purchase flow. Omit for members, and while no flow exists. */
  onBuy?: () => void;
}) {
  const { t } = useTranslation();
  const { held, licensedUsers, usersInUse } = wallet.team;

  const eyebrow = t("portal.billing.team.eyebrow", "Team plan");
  const barLabel = t("portal.billing.team.barLabel", "User capacity");

  // No Team plan. The member count is still the honest headline, so this reads as "here is your
  // team, here is what Team would add" rather than as an empty state.
  if (!held) {
    return (
      <Card padding="loose">
        <span className="portal-billing__eyebrow">{eyebrow}</span>
        <div className="portal-billing__bignum-row">
          <span className="portal-billing__bignum">
            {usersInUse.toLocaleString()}
          </span>
          <span className="portal-billing__bignum-unit">
            {t("portal.billing.team.unit", "users")}
          </span>
          <StatusBadge tone="info" size="sm" showDot={false}>
            {t("portal.billing.team.notHeld", "No Team plan")}
          </StatusBadge>
        </div>
        <div className="portal-billing__prepaid-foot">
          <p className="portal-billing__section-sub">
            {t(
              "portal.billing.team.offer",
              "Team covers your people rather than your processing, in blocks of 100 users, and applies to this account and any server you link to it.",
            )}
          </p>
          {onBuy && (
            <Button variant="secondary" size="sm" onClick={onBuy}>
              {t("portal.billing.team.buy", "Add Team")}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // Held with no user limit. Nothing to meter against, so the bar is hidden rather than shown
  // full or empty, both of which would be a lie about headroom.
  if (licensedUsers == null) {
    return (
      <Card padding="loose">
        <span className="portal-billing__eyebrow">{eyebrow}</span>
        <MeterBar
          state="FULL"
          pct={0}
          showBar={false}
          barLabel={barLabel}
          figure={usersInUse.toLocaleString()}
          capSuffix={t("portal.billing.team.noLimit", "users, no limit")}
          statusLabel={t("portal.billing.team.state.unlimited", "Unlimited")}
        />
      </Card>
    );
  }

  const { state, pct } = meterState(usersInUse, licensedUsers);
  const over = usersInUse > licensedUsers;
  const statusLabel = over
    ? t("portal.billing.team.state.over", "Over capacity")
    : state === "DEGRADED"
      ? t("portal.billing.team.state.full", "Full")
      : state === "WARNED"
        ? t("portal.billing.team.state.nearlyFull", "Nearly full")
        : t("portal.billing.team.state.healthy", "Room to grow");

  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">{eyebrow}</span>
      <MeterBar
        state={state}
        pct={pct}
        barLabel={barLabel}
        figure={usersInUse.toLocaleString()}
        capSuffix={t("portal.billing.team.capSuffix", "of {{licensed}} users", {
          licensed: licensedUsers.toLocaleString(),
        })}
        statusLabel={statusLabel}
      />
      <div className="portal-billing__prepaid-foot">
        <p className="portal-billing__section-sub">
          {over
            ? t(
                "portal.billing.team.overNote",
                "You have more members than this plan covers. Existing members keep working; adding another needs more capacity.",
              )
            : t(
                "portal.billing.team.note",
                "Counts every member of this team, and applies to any server you link to this account.",
              )}
        </p>
        {onBuy && (
          <Button variant="secondary" size="sm" onClick={onBuy}>
            {t("portal.billing.team.change", "Change capacity")}
          </Button>
        )}
      </div>
    </Card>
  );
}
