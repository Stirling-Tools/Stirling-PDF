import { useAppConfig } from "@app/contexts/AppConfigContext";

export { isProcessorEnabled } from "@app/services/processorEnabled";

/**
 * Whether this server runs the Processor (policies, sources, classification).
 * Mirrors the backend's `processor.enabled`, which gates the same features there.
 *
 * Defaults to OFF until app-config resolves so an editor-only deployment never
 * flashes Processor UI or fires a request at an endpoint that isn't mapped.
 */
export function useProcessorEnabled(): boolean {
  const { config } = useAppConfig();
  return config?.processorEnabled ?? false;
}
