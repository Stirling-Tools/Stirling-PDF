/** Whether this build has an org whose roster it can serve. A seam: a build that
 *  only sometimes has one shadows this. Server-backed always does. */
export function useRosterAvailable(): boolean {
  return true;
}
