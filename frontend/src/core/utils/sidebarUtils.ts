import { SidebarRefs, SidebarState, SidebarInfo } from '@app/types/sidebar';

/**
 * Gets the All tools sidebar information using React refs and state
 * @param refs - Object containing refs to sidebar elements
 * @param state - Current sidebar state
 * @returns Object containing the sidebar rect and whether the tool panel is active
 */
export function getSidebarInfo(refs: SidebarRefs, state: SidebarState): SidebarInfo {
  const { quickAccessRef, toolPanelRef } = refs;
  const { sidebarsVisible, readerMode } = state;
  
  // Determine if tool panel should be active based on state
  const isToolPanelActive = sidebarsVisible && !readerMode;
  
  let rect: DOMRect | null = null;
  
  if (isToolPanelActive && toolPanelRef.current) {
    // Tool panel is expanded: use its rect
    rect = toolPanelRef.current.getBoundingClientRect();
  } else if (quickAccessRef.current) {
    // Fall back to quick access bar
    // This probably isn't needed but if we ever have tooltips or modals that need to be positioned relative to the quick access bar, we can use this
    rect = quickAccessRef.current.getBoundingClientRect();
  }
  
  return {
    rect,
    isToolPanelActive,
    sidebarState: state
  };
}

 