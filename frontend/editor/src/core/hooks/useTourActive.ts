import { useEffect, useState } from "react";
import { TOUR_STATE_EVENT, type TourStatePayload } from "@app/constants/events";

/**
 * Whether a guided product tour is currently running.
 *
 * <p>Tracks {@link TOUR_STATE_EVENT}, which the onboarding tour runners dispatch on open/close.
 * Starts {@code false} and flips with each event, so a consumer mounted before the tour opens sees
 * the transition.
 *
 * <p>Used to suppress background side effects that must not fire during a scripted demo: notably
 * the document-classification and policy auto-run pipelines, whose backend steps are billable and
 * entitlement-gated. The tour loads a canned sample file purely to demonstrate a tool; running it
 * through those pipelines would consume the account's usage and can trip the usage-limit gate,
 * which is why a brand-new account can see the "limit reached" modal mid-tour.
 */
export function useTourActive(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onTourState = (event: Event) => {
      const detail = (event as CustomEvent<TourStatePayload>).detail;
      setActive(Boolean(detail?.isOpen));
    };
    window.addEventListener(TOUR_STATE_EVENT, onTourState);
    return () => window.removeEventListener(TOUR_STATE_EVENT, onTourState);
  }, []);

  return active;
}
