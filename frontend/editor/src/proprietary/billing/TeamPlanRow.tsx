import { useTranslation } from "react-i18next";
import { MeterRow } from "@app/billing/MeterRow";
import type { ServerPlan } from "@app/billing/serverPlan";
import type { Wallet } from "@app/billing/types";
import { SeatBreakdown } from "@app/billing/SeatBreakdown";
import { fleetUsersInUse } from "@app/billing/fleetSeats";

/**
 * The Team product, as a row: users against the capacity the plan covers.
 *
 * <p>Reads {@code wallet.team}, not {@code wallet.status}: that axis covers one product, so a team
 * holding Team without the Processor would be described wrongly by it.
 *
 * <p>{@code licensedUsers} is null for "no limit" and never a sentinel, so there is nothing to
 * divide by.
 */
export function TeamPlanRow({
  wallet,
  selfHosted = false,
  serverPlan,
  onAddCapacity,
  usersInUse: occupiedSeats,
  userLimit,
  deviceId,
}: {
  wallet: Wallet | null;
  serverPlan?: ServerPlan;
  /** Self-hosted phrases its free tier differently: that allowance is its own. */
  selfHosted?: boolean;
  /** Leader-only: the door that sells Team capacity. Omit for members. */
  onAddCapacity?: () => void;
  /** Live local roster replaces this deployment's report in the fleet total. */
  usersInUse?: number | null;
  /** Used only for standalone servers; linked fleets show the full plan capacity. */
  userLimit?: number | null;
  deviceId?: string | null;
}) {
  const { t } = useTranslation();
  if (serverPlan) {
    const unlimited = serverPlan.licenseType === "SERVER";
    const users = serverPlan.usersInUse;
    return (
      <MeterRow
        name={t("portal.billing.team.rowName", "Users")}
        mid={t(
          "portal.billing.serverPlan.included",
          "Included with your license",
        )}
        tone="paid"
        showTrack={!unlimited && users != null && serverPlan.maxUsers > 0}
        pct={
          users != null && serverPlan.maxUsers > 0
            ? (users / serverPlan.maxUsers) * 100
            : 0
        }
        fact={
          unlimited
            ? t("portal.billing.serverPlan.unlimited", "Unlimited users")
            : users == null
              ? t(
                  "portal.billing.serverPlan.seats",
                  "{{seats}} licensed seats",
                  {
                    seats: serverPlan.maxUsers.toLocaleString(),
                  },
                )
              : t(
                  "portal.billing.team.fact",
                  "{{users}} of {{licensed}} users",
                  {
                    users: users.toLocaleString(),
                    licensed: serverPlan.maxUsers.toLocaleString(),
                  },
                )
        }
      />
    );
  }
  if (!wallet) return null;
  const { held, licensedUsers } = wallet.team;
  const usersInUse = wallet.team.fleet
    ? fleetUsersInUse(wallet.team, deviceId, occupiedSeats)
    : occupiedSeats === undefined
      ? wallet.team.usersInUse
      : occupiedSeats;
  const processorActive = Boolean(wallet.processor?.active);

  const mid =
    !wallet.team.fleet && userLimit !== undefined
      ? t(
          "portal.billing.team.midLocalCapacity",
          "Capacity available to this server",
        )
      : !held
        ? selfHosted
          ? t(
              "portal.billing.team.midFreeSelfHosted",
              "The free tier covers your first users",
            )
          : t("portal.billing.team.midFree", "The Team plan covers 100 users")
        : processorActive
          ? t("portal.billing.team.midIncluded", "Included with your Team base")
          : t("portal.billing.team.midPrice", "$99/mo per 100 users");

  const door = onAddCapacity
    ? t("portal.billing.team.addCapacity", "Add capacity")
    : undefined;
  const name = t("portal.billing.team.rowName", "Users");
  const details = wallet.team.breakdown ? (
    <SeatBreakdown
      breakdown={wallet.team.breakdown}
      deviceId={deviceId}
      localUsers={occupiedSeats}
    />
  ) : undefined;

  const limit =
    !wallet.team.fleet && userLimit !== undefined
      ? userLimit
      : held
        ? licensedUsers
        : (licensedUsers ?? wallet.freeUserAllowance ?? null);

  if (usersInUse == null) {
    return (
      <MeterRow
        name={name}
        details={details}
        mid={mid}
        showTrack={false}
        tone={held ? "paid" : "free"}
        fact={
          limit != null
            ? t("portal.billing.serverPlan.seats", "{{seats}} licensed seats", {
                seats: limit.toLocaleString(),
              })
            : "—"
        }
        door={door}
        onDoor={onAddCapacity}
      />
    );
  }

  if (limit == null) {
    return (
      <MeterRow
        name={name}
        details={details}
        mid={mid}
        showTrack={false}
        tone={held ? "paid" : "free"}
        fact={t("portal.billing.team.factNoLimit", "{{users}} users", {
          users: usersInUse.toLocaleString(),
        })}
        door={door}
        onDoor={onAddCapacity}
      />
    );
  }

  const pct =
    limit === 0 ? (usersInUse > 0 ? 100 : 0) : (usersInUse / limit) * 100;
  // A free tier filling up is the product working, not a warning, so amber is for paid capacity.
  const tone = held ? (pct >= 90 ? "warn" : "paid") : "free";

  return (
    <MeterRow
      name={name}
      details={details}
      mid={mid}
      pct={pct}
      tone={tone}
      fact={t("portal.billing.team.fact", "{{users}} of {{licensed}} users", {
        users: usersInUse.toLocaleString(),
        licensed: limit.toLocaleString(),
      })}
      door={door}
      onDoor={onAddCapacity}
    />
  );
}
