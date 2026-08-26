import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * The sibling app this build can switch to (editor ⇄ processor), or null when
 * there is none. The single gate behind both the brand switcher and the
 * sidebar footer's "Open ..." row, so the two can never disagree about access.
 *
 * Core ships no processor, so there is nothing to switch to.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  return null;
}
