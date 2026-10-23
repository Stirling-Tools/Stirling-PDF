import { useWallet as useCloudWallet } from "@editor-cloud/hooks/useWallet";
import { useConfirmedSaaSMode } from "@editor/hooks/useConfirmedSaaSMode";

export type {
  UseWalletResult,
  Wallet,
  WalletStatus,
  WalletRole,
  WalletMember,
  WalletCategoryBreakdown,
  WalletActivityRow,
} from "@editor-cloud/hooks/useWallet";

/** Local and self-hosted backends do not provide cloud billing. */
export function useWallet(enabled = true) {
  const saasMode = useConfirmedSaaSMode();
  return useCloudWallet(enabled && saasMode);
}
