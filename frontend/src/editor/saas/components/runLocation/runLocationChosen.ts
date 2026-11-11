// Versioned so a redesign of the chooser can be shown again to everyone.
const RUN_LOCATION_CHOSEN_KEY = "stirling.runLocationChosen.v1";

/** False when storage is unreadable, so a locked-down browser still gets the chooser. */
export function hasChosenRunLocation(): boolean {
  try {
    return window.localStorage.getItem(RUN_LOCATION_CHOSEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function markRunLocationChosen(): void {
  try {
    window.localStorage.setItem(RUN_LOCATION_CHOSEN_KEY, "true");
  } catch {
    // Without storage the chooser simply shows again on the next load.
  }
}
