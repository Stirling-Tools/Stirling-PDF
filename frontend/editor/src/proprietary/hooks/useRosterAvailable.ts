/**
 * Whether this build has an org whose roster it can serve.
 *
 * <p>A seam: a build that only sometimes has one behind it shadows this. A
 * server-backed build always does, so the answer here is constant.
 */
export function useRosterAvailable(): boolean {
  return true;
}
