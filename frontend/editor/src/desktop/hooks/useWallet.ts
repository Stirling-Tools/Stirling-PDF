import { useWallet as useCloudWallet } from "@cloud/hooks/useWallet";
import { useConfirmedSaaSMode } from "@app/hooks/useConfirmedSaaSMode";

export type {
  UseWalletResult,
  Wallet,
  WalletStatus,
  WalletRole,
  WalletMember,
  WalletCategoryBreakdown,
  WalletActivityRow,
} from "@cloud/hooks/useWallet";

/** The cloud wallet is unavailable on the bundled and self-hosted backends. */
export function useWallet() {
  return useCloudWallet({ enabled: useConfirmedSaaSMode() });
}
