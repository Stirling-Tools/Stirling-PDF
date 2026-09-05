import { useTranslation } from "react-i18next";
import type { UserCapacity } from "@app/billing";
import "@portal/views/Users.css";

interface Props {
  capacity: UserCapacity;
  /** Absent when there is no way to buy from this build; the line then reads as text only. */
  onAddCapacity?: () => void;
}

/**
 * The user count under the Users heading, and the one place capacity is sold from.
 *
 * Deliberately a sentence rather than a meter. An uncapped licence says only how many users
 * there are, because "64 of unlimited" is not a fact anyone needs; a capped one adds the limit
 * and a way to raise it. Plan counts and block sizes stay out of it and belong in the checkout,
 * where they change what you pay.
 */
export function CapacityLine({ capacity, onAddCapacity }: Props) {
  const { t } = useTranslation();

  const count =
    capacity.kind === "unlimited"
      ? t("portal.users.capacity.usedOnly", "{{used}} users", {
          used: capacity.used,
        })
      : t("portal.users.capacity.usedOfLimit", "{{used}} of {{limit}} users", {
          used: capacity.used,
          limit: capacity.limit,
        });

  // Only worth explaining once something invisible is holding a slot, otherwise the count
  // matches the roster and the note is noise.
  const held = capacity.disabled + capacity.pendingInvites;
  const title =
    capacity.kind !== "unlimited" && held > 0
      ? t(
          "portal.users.capacity.heldNote",
          "Includes {{disabled}} disabled and {{invited}} invited, which each use a slot.",
          { disabled: capacity.disabled, invited: capacity.pendingInvites },
        )
      : undefined;

  const tone = capacity.atCapacity
    ? "full"
    : capacity.nearLimit
      ? "near"
      : "ok";

  // An uncapped licence has nothing to sell, so the offer is suppressed here rather than by
  // each caller — otherwise the next surface to render this line reintroduces the same bug.
  const canBuy = capacity.kind !== "unlimited" ? onAddCapacity : undefined;

  return (
    <p className="portal-users__sub portal-users__capacity" data-tone={tone}>
      <span className="portal-users__capacity-count" title={title}>
        {count}
      </span>
      {canBuy && (
        <>
          {" · "}
          <button
            type="button"
            className="portal-users__capacity-action"
            onClick={canBuy}
          >
            {capacity.kind === "seats"
              ? t("portal.users.capacity.updateSeats", "Update seats")
              : t("portal.users.capacity.add", "Add capacity")}
          </button>
        </>
      )}
    </p>
  );
}

export default CapacityLine;
