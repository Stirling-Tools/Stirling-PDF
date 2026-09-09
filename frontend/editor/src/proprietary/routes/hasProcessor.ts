/** Dev always ships it, so the switch is there to work on. */
export const HAS_PROCESSOR =
  import.meta.env.VITE_INCLUDE_PROCESSOR === "true" || import.meta.env.DEV;
