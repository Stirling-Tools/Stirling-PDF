import type { RequestHandler } from "msw";

/**
 * Per-build runtime setup for the Storybook preview. Every build but desktop
 * needs none; the desktop build swaps in `flavorSetup.desktop.ts` (see the
 * resolve plugin in main.ts), which keeps desktop-only code out of the others.
 */
export const flavorHandlers: RequestHandler[] = [];

export function startFlavor(): void {}
