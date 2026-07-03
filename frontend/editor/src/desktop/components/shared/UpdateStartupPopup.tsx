/**
 * Desktop (Tauri) override of @app/components/shared/UpdateStartupPopup.
 *
 * On desktop the update flow is owned end-to-end by `useDesktopUpdatePopup`,
 * which also honours the headless `updateMode` provisioning flag and wires up
 * the silent/auto installer. The web startup popup must therefore be a no-op
 * here, otherwise both would run and double-popup.
 */
export function UpdateStartupPopup() {
  return null;
}

export default UpdateStartupPopup;
