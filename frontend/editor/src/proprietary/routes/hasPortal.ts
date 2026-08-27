/**
 * Self-hosted ships the processor when the build asks for it. Dev always does, so
 * the switch is there to work on.
 */
export const HAS_PORTAL =
  import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;
