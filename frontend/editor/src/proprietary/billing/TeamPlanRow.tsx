import { useTranslation } from "react-i18next";
import { MeterRow } from "@app/billing/MeterRow";
import type { Wallet } from "@app/billing/types";

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
  onAddCapacity,
}: {
  wallet: Wallet;
  /** Self-hosted phrases its free tier differently: that allowance is its own. */
  selfHosted?: boolean;
  /** Leader-only: the door that sells Team capacity. Omit for members. */
  onAddCapacity?: () => void;
}) {
  const { t } = useTranslation();
  const { held, licensedUsers, usersInUse } = wallet.team;
  const processorActive = Boolean(wallet.processor?.active);

  const mid = !held
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

  // One number in charge at a time: the server's free allowance until a plan is held, the
  // plan's own limit after.
  const limit = held
    ? licensedUsers
    : (licensedUsers ?? wallet.freeUserAllowance ?? null);

  if (limit == null) {
    return (
      <MeterRow
        name={name}
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

  const pct = (usersInUse / limit) * 100;
  // A free tier filling up is the product working, not a warning, so amber is for paid capacity.
  const tone = held ? (pct >= 90 ? "warn" : "paid") : "free";

  return (
    <MeterRow
      name={name}
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
