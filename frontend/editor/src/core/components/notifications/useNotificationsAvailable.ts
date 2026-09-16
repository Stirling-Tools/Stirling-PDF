/**
 * Whether this build has a notifications API to read. When it does not, the bell must not
 * mount at all: an unconditional mount would poll an endpoint that does not exist, leaving a
 * permanent timer and a 404 in the network log for nothing it could ever show.
 *
 * Core has no failure registry and no notification routes, so the answer here is no; a build
 * that ships them overrides this to say so.
 */
export function useNotificationsAvailable(): boolean {
  return false;
}
