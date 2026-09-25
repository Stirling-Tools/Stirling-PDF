/** Why folder processing cannot be set up right now, or null when it can.
 *  Always null on web, served by the backend that runs the pipelines; other builds shadow this. */
export function useServerProcessingBlock(): string | null {
  return null;
}
