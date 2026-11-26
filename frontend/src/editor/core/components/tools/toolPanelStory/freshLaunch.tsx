/**
 * Per-page state a build keeps between stories that a real launch starts
 * without. Core keeps none, so both are no-ops; a build that does shadows this
 * module.
 */

/** Drops what an earlier story left behind; call before the providers mount. */
export function forgetEarlierStories(): void {}

/** Fetches what a launch fetches once the editor's providers are up. */
export function FreshLaunch() {
  return null;
}
