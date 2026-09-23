import { useFreeTierBalance } from "@portal/hooks/useFreeTierBalance";
import { FreeTierBalanceSummary } from "@app/components/account-link/FreeTierBalanceSummary";

/** Reads the Processor ledger and omits unavailable figures. */
export function FreeTierExhaustedSummary() {
  const { data: balance } = useFreeTierBalance();
  return <FreeTierBalanceSummary balance={balance} />;
}
