import type {
  NotificationActionOffer,
  NotificationActionSlot,
} from "@app/services/notifications";

/**
 * Where each of a row's actions ends up on screen. The server says what an action does and how much of
 * the row it has earned; this turns that into an order and a prominence. A pure function because it is
 * the one piece of the bell that decides prominence, and every failure kind goes through it.
 */

const SLOT_RANK: Record<NotificationActionSlot, number> = {
  RESOLUTION: 0,
  SECONDARY: 1,
  OVERFLOW: 2,
};

export interface PromotedActions {
  /** The row's own button. Null when nothing survived the filter. */
  primary: NotificationActionOffer | null;
  /** A second button, only ever an action the server marked SECONDARY. */
  secondary: NotificationActionOffer | null;
  /** Everything else, in the server's order, for the row to render quietly after those two. */
  overflow: NotificationActionOffer[];
  /**
   * The reason the server gave for the best action it withheld, for the row to state once. Null when
   * it withheld nothing, or gave no reason.
   */
  withheldReasonKey: string | null;
}

/**
 * Promote a row's offers into one primary button, at most one secondary button, and the quiet rest.
 *
 * Every offer the bell is given is one this client runs itself, so each is asked past
 * `canRenderClientAction`: whether this build knows the id, and whether this device can currently
 * perform it.
 *
 * A dropped action leaves no hole, and a disabled one is dropped too: a button that can never work is
 * false hope. Its reason comes back instead, for the row to say in words.
 */
export function promoteActions(
  offers: readonly NotificationActionOffer[],
  canRenderClientAction: (offer: NotificationActionOffer) => boolean,
): PromotedActions {
  const ranked = offers
    .map((offer, declaredAt) => ({ offer, declaredAt }))
    // Slot first, then declaration order, so two actions in one slot keep the server's ranking.
    .sort(
      (a, b) =>
        SLOT_RANK[a.offer.slot] - SLOT_RANK[b.offer.slot] ||
        a.declaredAt - b.declaredAt,
    )
    .map(({ offer }) => offer);

  // The best one withheld, so a row explains itself once rather than once per lost action.
  const withheldReasonKey =
    ranked.find((offer) => !offer.enabled && offer.disabledReasonKey)
      ?.disabledReasonKey ?? null;

  const renderable = ranked.filter(
    (offer) => offer.enabled && canRenderClientAction(offer),
  );

  const [primary, next, ...rest] = renderable;
  if (!primary)
    return { primary: null, secondary: null, overflow: [], withheldReasonKey };

  // Only if the server ranked it SECONDARY: a second RESOLUTION would read as two answers to the same
  // problem, and an OVERFLOW one was ranked below the row's own buttons by the server itself.
  const secondary = next?.slot === "SECONDARY" ? next : null;

  return {
    primary,
    secondary,
    overflow: secondary ? rest : next ? [next, ...rest] : rest,
    withheldReasonKey,
  };
}
