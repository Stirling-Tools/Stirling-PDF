import { Banner, Button } from "@shared/components";
import { formatCountdown } from "@portal/components/documents/format";

interface ElevationBannerProps {
  /** Seconds left on the active grant, or null when no grant is active. */
  secondsLeft: number | null;
  /** True for tiers with the four-eyes elevation flow (enterprise). */
  fourEyes: boolean;
  onRequest: () => void;
}

/**
 * Zero-standing-access affordance for a sensitive document. With no active
 * grant it offers a "Request access" button; once granted it counts down the
 * remaining window. The grant is client-side only — see the view for the
 * backend TODO.
 */
export function ElevationBanner({
  secondsLeft,
  fourEyes,
  onRequest,
}: ElevationBannerProps) {
  if (secondsLeft !== null) {
    return (
      <Banner
        tone="success"
        icon={<span aria-hidden>⏱</span>}
        title={`Access expires in ${formatCountdown(secondsLeft)}`}
        description={
          fourEyes
            ? "Temporary grant — a peer reviewer was notified (four-eyes)."
            : "Temporary grant — access is logged and time-boxed."
        }
      />
    );
  }

  return (
    <Banner
      tone="warning"
      icon={<span aria-hidden>🔒</span>}
      title="Sensitive document"
      description={
        fourEyes
          ? "Content is gated by zero-standing-access. Requesting starts a time-boxed grant and notifies a peer reviewer (four-eyes)."
          : "Content is gated by zero-standing-access. Requesting starts a time-boxed grant."
      }
      action={
        <Button size="sm" onClick={onRequest}>
          Request access
        </Button>
      }
    />
  );
}
