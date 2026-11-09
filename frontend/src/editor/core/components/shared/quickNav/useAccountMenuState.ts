import { useAuth } from "@editor/auth/UseSession";
import type {
  QuickNavAccountAction,
  QuickNavAccountHeader,
} from "@editor/contexts/QuickNavHostContext";

export interface AccountMenuState {
  header?: QuickNavAccountHeader;
  actions: QuickNavAccountAction[];
}

export function useAccountMenuState(): AccountMenuState {
  const { user, loading } = useAuth();
  return { header: !loading && !user ? "local" : undefined, actions: [] };
}
