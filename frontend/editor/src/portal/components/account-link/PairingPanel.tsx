import { usePairing } from "@portal/hooks/usePairing";
import { PairingPanelView } from "@portal/components/account-link/PairingPanelView";

interface Props {
  /** Only polls while true, so a closed dialog costs nothing. */
  active: boolean;
  /** Fired once the pairing is approved and the credential is stored. */
  onLinked: () => void | Promise<void>;
}

/**
 * Shows the pairing code for this server and waits for a team leader to approve
 * it (device grant, RFC 8628).
 *
 * <p>This is what replaces signing in to Stirling on the server itself. The admin
 * can approve from any device, which is the only way SSO and sign-up can work:
 * a customer's own origin can never be on the identity provider's redirect
 * allow-list, so the human half of the flow has to happen on our site.
 *
 * <p>Data only. {@link PairingPanelView} draws it, so every state stays reachable
 * from Storybook without a network.
 */
export function PairingPanel({ active, onLinked }: Props) {
  const { view, secondsLeft, starting, error, restart } = usePairing(
    active,
    onLinked,
  );

  return (
    <PairingPanelView
      view={view}
      secondsLeft={secondsLeft}
      loading={starting}
      error={error}
      onRetry={() => void restart()}
    />
  );
}
