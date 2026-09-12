/** Whether a server serving the non-core API — policies, processing folders, AI — backs the app.
 *  Always true on web, which is served by that backend; builds without one shadow this file. */
export function useConnectedServer(): boolean {
  return true;
}
