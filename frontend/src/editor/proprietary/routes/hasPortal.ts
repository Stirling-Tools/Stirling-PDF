/** Dev always ships it, so the switch is there to work on. */
export const HAS_PORTAL =
  import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;
