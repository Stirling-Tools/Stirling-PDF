import type {
  QuickNavAccountAction,
  QuickNavAccountHeader,
} from "@editor/contexts/QuickNavHostContext";

export interface AccountMenuState {
  header?: QuickNavAccountHeader;
  actions: QuickNavAccountAction[];
}

export function useAccountMenuState(): AccountMenuState {
  return { actions: [] };
}
