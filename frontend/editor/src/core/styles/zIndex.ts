// Centralized z-index constants for new usages added in this branch.
// Keep values identical to their original inline usages.

export const Z_INDEX_FULLSCREEN_SURFACE = 1000;
export const Z_INDEX_OVER_FULLSCREEN_SURFACE = 1300;
export const Z_ANALYTICS_MODAL = 1301;
// Config/Settings modal - should appear above analytics modal when navigating from onboarding
export const Z_INDEX_CONFIG_MODAL = 1400;

export const Z_INDEX_FILE_MANAGER_MODAL = 1200;

// Chat FAB overlay — sits above normal app chrome (fullscreen surface: 1000)
// but below all modals (automate: 1100, file manager: 1200, config: 1400).
export const Z_INDEX_CHAT_FAB_OVERLAY = 1050;
export const Z_INDEX_OVER_FILE_MANAGER_MODAL = 1300;

export const Z_INDEX_AUTOMATE_MODAL = 1100;
// Dropdowns/Popovers inside automation modals need to be above the modal
export const Z_INDEX_AUTOMATE_DROPDOWN = 1150;

// page editor Zindexes
export const Z_INDEX_HOVER_ACTION_MENU = 100;
export const Z_INDEX_SELECTION_BOX = 1000;
export const Z_INDEX_DROP_INDICATOR = 1001;
export const Z_INDEX_DRAG_BADGE = 1001;
// Modal that appears on top of config modal (e.g., restart confirmation, update modal)
export const Z_INDEX_OVER_CONFIG_MODAL = 2000;

// Sign-in modal — must appear above all app UI including config and analytics modals
export const Z_INDEX_SIGN_IN_MODAL = 9000;

// Floating viewer menus rendered through document.body portals.
export const Z_INDEX_VIEWER_FLOATING_MENU = 10000;

// Toast notifications and error displays - Always on top (higher than rainbow theme at 10000)
export const Z_INDEX_TOAST = 10001;

// Signature preview overlays inside the PDF viewer
export const Z_INDEX_SIGNATURE_DRAG_BLOCKER = 999;
export const Z_INDEX_SIGNATURE_OVERLAY = 1000;
export const Z_INDEX_SIGNATURE_OVERLAY_HANDLE = 1001;
export const Z_INDEX_SIGNATURE_OVERLAY_DELETE = 1002;
