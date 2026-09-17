import { useWallet as useCloudWallet } from "@cloud/hooks/useWallet";
import { useSaaSMode } from "@app/hooks/useSaaSMode";

export type {
  UseWalletResult,
  Wallet,
  WalletStatus,
  WalletRole,
  WalletMember,
  WalletCategoryBreakdown,
  WalletActivityRow,
} from "@cloud/hooks/useWallet";

/** Local and self-hosted backends do not provide cloud billing. */
export function useWallet(enabled = true) {
  const saasMode = useSaaSMode();
  return useCloudWallet(enabled && saasMode);
}
