import { http, HttpResponse, type RequestHandler } from "msw";
// oxlint-disable-next-line no-restricted-imports -- Storybook-only: config files have no @editor alias
import { tauriBackendService } from "../src/editor/desktop/services/tauriBackendService";

/**
 * The bundled backend's health check, answered for every story. A story that
 * serves its own app config still wins: story handlers come first.
 */
export const flavorHandlers: RequestHandler[] = [
  http.get("*/api/v1/config/app-config", () =>
    HttpResponse.json({ dependenciesReady: true }),
  ),
];

/**
 * Starts the desktop shell's bundled backend, as launching the app does. Tool
 * panel stories also start it through the editor's providers; a component
 * story that calls the API directly would otherwise find no backend URL.
 */
export function startFlavor(): void {
  void tauriBackendService.startBackend().catch(() => {});
}
