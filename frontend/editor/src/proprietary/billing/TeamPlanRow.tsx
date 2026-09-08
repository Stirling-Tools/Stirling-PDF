import { useTranslation } from "react-i18next";
import { MeterRow } from "@app/billing/MeterRow";
import type { Wallet } from "@app/billing/types";

/**
 * The Team product, as a row: users measured against the capacity the plan covers.
 *
 * <p>Reads {@code wallet.team} rather than {@code wallet.status}, so a team holding Team without
 * the Processor renders correctly instead of being described by an axis that covers only one of
 * the two products.
 *
 * <p>The middle line follows the screen's copy razor: each fact is printed once, and the plan
 * identity above is where the plan's price lives. So the row prices Team only when the identity
 * does not, and says "included" once the Processor identity has already carried the base.
 *
 * <p>{@code licensedUsers} is null for "no limit" and never a sentinel, so there is nothing to
 * divide by. That case drops the track rather than drawing it full or empty, both of which would
 * be claims about headroom that an absent limit cannot support.
 */
export function TeamPlanRow({
  wallet,
  selfHosted = false,
  onAddCapacity,
}: {
  wallet: Wallet;
  /** Self-hosted phrases its free tier differently, because that allowance is its own. */
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

  if (licensedUsers == null) {
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

  const pct = (usersInUse / licensedUsers) * 100;
  // Amber is for capacity that is actually paid for. A free tier filling up is the product working
  // as intended, not a warning.
  const tone = held ? (pct >= 90 ? "warn" : "paid") : "free";

  return (
    <MeterRow
      name={name}
      mid={mid}
      pct={pct}
      tone={tone}
      fact={t("portal.billing.team.fact", "{{users}} of {{licensed}} users", {
        users: usersInUse.toLocaleString(),
        licensed: licensedUsers.toLocaleString(),
      })}
      door={door}
      onDoor={onAddCapacity}
    />
  );
}
