import type {
  NotificationActionOffer,
  NotificationActionSlot,
} from "@app/services/notifications";

// The server says what an action does and what it has earned; this turns that into an order.

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
  /** The reason for the best action withheld, for the row to state once. */
  withheldReasonKey: string | null;
}

/** One primary, at most one secondary, and the quiet rest. A disabled action is dropped. */
export function promoteActions(
  offers: readonly NotificationActionOffer[],
  canRenderClientAction: (offer: NotificationActionOffer) => boolean,
  knowsAction: (offer: NotificationActionOffer) => boolean,
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
    ranked.find(
      (offer) =>
        !offer.enabled && offer.disabledReasonKey && knowsAction(offer),
    )?.disabledReasonKey ?? null;

  const renderable = ranked.filter(
    (offer) => offer.enabled && canRenderClientAction(offer),
  );

  const [primary, next, ...rest] = renderable;
  if (!primary)
    return { primary: null, secondary: null, overflow: [], withheldReasonKey };

  // A second RESOLUTION would read as two answers to one problem; OVERFLOW was ranked below.
  const secondary = next?.slot === "SECONDARY" ? next : null;

  return {
    primary,
    secondary,
    overflow: secondary ? rest : next ? [next, ...rest] : rest,
    withheldReasonKey,
  };
}
