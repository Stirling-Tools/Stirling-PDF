/**
 * Scenario registry: what `--scenario <id>` can name without a file path.
 *
 * A scenario drives exactly one open/use/close cycle; the harness repeats it.
 */
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { BUILTIN_SCENARIOS as EDITOR_SCENARIOS } from "./editor-cycle";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { BUILTIN_SCENARIOS as TEXT_EDITOR_SCENARIOS } from "./text-editor-cycle";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { toolColorControls } from "./tool-color-controls";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { BUILTIN_SCENARIOS as VIEWER_SCENARIOS } from "./viewer-document-cycle";

export const BUILTIN_SCENARIOS = [
  ...EDITOR_SCENARIOS,
  ...TEXT_EDITOR_SCENARIOS,
  toolColorControls,
  ...VIEWER_SCENARIOS,
];

/**
 * The route a run is measured at. `--route` is an override for the rare case
 * where the route has to be forced; a scenario's own route is the endpoint its
 * cycle actually exercises, so it wins whenever no override was passed.
 */
export function resolveRoute(cliRoute: string, scenarioRoute: string): string {
  return cliRoute || scenarioRoute;
}
