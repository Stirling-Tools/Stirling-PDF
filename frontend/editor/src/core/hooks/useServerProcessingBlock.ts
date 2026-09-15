/**
 * Why folder processing can't be set up right now, or null when it can.
 *
 * Always null here: a web build is served by the backend that runs the pipelines.
 * Builds whose bundled backend cannot run them shadow this file.
 */
export function useServerProcessingBlock(): string | null {
  return null;
}
