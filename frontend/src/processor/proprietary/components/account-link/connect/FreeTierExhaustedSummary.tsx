import { useFreeTierBalance } from "@processor/hooks/useFreeTierBalance";
import { FreeTierBalanceSummary } from "@editor/components/account-link/FreeTierBalanceSummary";

/** Reads the Processor ledger and omits unavailable figures. */
export function FreeTierExhaustedSummary() {
  const { data: balance } = useFreeTierBalance();
  return <FreeTierBalanceSummary balance={balance} />;
}
