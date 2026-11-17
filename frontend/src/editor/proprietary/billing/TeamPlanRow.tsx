import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { USERS_PER_BLOCK } from "@editor/components/shared/stripeCheckout/utils/capacity";
import { MeterRow, type MeterRowTone } from "@editor/billing/MeterRow";
import type { ServerPlan } from "@editor/billing/serverPlan";
import type { Wallet } from "@editor/billing/types";
import { SeatBreakdown } from "@editor/billing/SeatBreakdown";
import { fleetUsersInUse, teamUsersInUse } from "@editor/billing/fleetSeats";
import type { LegacyTeamAllowance } from "@editor/types/legacyBilling";

function licensedUsersFact(
  t: TFunction,
  users: number | null,
  maxUsers: number,
): string {
  if (users == null) {
    return t("portal.billing.serverPlan.seats", "{{seats}} licensed seats", {
      seats: maxUsers.toLocaleString(),
    });
  }
  return t("portal.billing.team.fact", "{{users}} of {{licensed}} users", {
    users: users.toLocaleString(),
    licensed: maxUsers.toLocaleString(),
  });
}

function teamMid(
  t: TFunction,
  {
    localCapacity,
    held,
    selfHosted,
    processorActive,
  }: {
    localCapacity: boolean;
    held: boolean;
    selfHosted: boolean;
    processorActive: boolean;
  },
): string {
  if (localCapacity) {
    return t(
      "portal.billing.team.midLocalCapacity",
      "Capacity available to this server",
    );
  }
  if (!held && selfHosted) {
    return t(
      "portal.billing.team.midFreeSelfHosted",
      "The free tier covers your first users",
    );
  }
  if (!held) {
    return t(
      "portal.billing.team.midFree",
      "The Team plan covers {{users}} users",
      { users: USERS_PER_BLOCK },
    );
  }
  if (processorActive) {
    return t("portal.billing.team.midIncluded", "Included with your Team base");
  }
  return t("portal.billing.team.midPrice", "$99/mo per {{users}} users", {
    users: USERS_PER_BLOCK,
  });
}

/** A standalone server's own limit wins; otherwise a free team falls back to the free user cap. */
function teamLimit(
  wallet: Wallet,
  localLimit: number | null | undefined,
): number | null {
  if (localLimit !== undefined) return localLimit;
  const { held, licensedUsers } = wallet.team;
  if (held) return licensedUsers;
  return licensedUsers ?? wallet.freeUserAllowance ?? null;
}

function usagePct(used: number, limit: number): number {
  if (limit === 0) return used > 0 ? 100 : 0;
  return (used / limit) * 100;
}

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
  legacyAllowance,
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
  /** Applied only when the historical subscription belongs to the displayed wallet's team. */
  legacyAllowance?: LegacyTeamAllowance;
}) {
  const { t } = useTranslation();
  if (wallet?.enterprise) {
    const agreed = wallet.enterprise.agreedSeats;
    const used = wallet.team.fleet
      ? fleetUsersInUse(wallet.team, deviceId, occupiedSeats)
      : (occupiedSeats ?? wallet.team.usersInUse);
    const over =
      agreed != null && agreed > 0 && used != null
        ? Math.max(0, used - agreed)
        : 0;
    return (
      <MeterRow
        name={t("portal.billing.team.rowName", "Users")}
        mid={
          over > 0
            ? t("portal.billing.enterprise.usersOver", { count: over })
            : t("portal.billing.enterprise.included")
        }
        fact={
          agreed != null && agreed > 0
            ? t("portal.billing.enterprise.usersAgreed", {
                used: used ?? "—",
                agreed,
              })
            : t("portal.billing.team.factNoLimit", { users: used ?? "—" })
        }
        tone={over > 0 ? "warn" : "paid"}
        showTrack={agreed != null && agreed > 0 && used != null}
        pct={agreed && used != null ? (used / agreed) * 100 : 0}
      />
    );
  }
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
            : licensedUsersFact(t, users, serverPlan.maxUsers)
        }
      />
    );
  }
  if (!wallet) return null;
  if (legacyAllowance && legacyAllowance.teamId === wallet.teamId) {
    const { usersInUse, maxUsers } = legacyAllowance;
    return (
      <MeterRow
        name={t("portal.billing.team.rowName", "Users")}
        mid={t(
          "legacyBilling.currentTeamAllowance",
          "Current allowance for your legacy team",
        )}
        showTrack={maxUsers != null && maxUsers > 0}
        pct={maxUsers ? (usersInUse / maxUsers) * 100 : 0}
        tone="paid"
        fact={
          maxUsers == null
            ? t("portal.users.seats.unlimited", "{{used}} · Unlimited", {
                used: usersInUse,
              })
            : t("portal.billing.team.fact", "{{users}} of {{licensed}} users", {
                users: usersInUse,
                licensed: maxUsers,
              })
        }
      />
    );
  }
  const { held } = wallet.team;
  const usersInUse = teamUsersInUse(wallet.team, deviceId, occupiedSeats);
  const localLimit = wallet.team.fleet ? undefined : userLimit;
  const mid = teamMid(t, {
    localCapacity: localLimit !== undefined,
    held,
    selfHosted,
    processorActive: Boolean(wallet.processor?.active),
  });

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

  const limit = teamLimit(wallet, localLimit);

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

  const pct = usagePct(usersInUse, limit);
  // A free tier filling up is the product working, not a warning, so amber is for paid capacity.
  let tone: MeterRowTone = "free";
  if (held) tone = pct >= 90 ? "warn" : "paid";

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
