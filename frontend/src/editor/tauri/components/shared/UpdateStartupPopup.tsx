/**
 * The web startup popup offers a server download, which a native app never wants: the
 * platform owns its own updates (the desktop updater's popup comes from
 * `useUpdatePopupModal`, app stores elsewhere). Running both would double-popup.
 */
export function UpdateStartupPopup() {
  return null;
}

export default UpdateStartupPopup;
