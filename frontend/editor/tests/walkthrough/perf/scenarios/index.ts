/**
 * Scenario registry: what `--scenario <id>` can name without a file path.
 *
 * A scenario drives exactly one open/use/close cycle; the harness repeats it.
 */
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { BUILTIN_SCENARIOS as EDITOR_SCENARIOS } from "./editor-cycle";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { BUILTIN_SCENARIOS as TEXT_EDITOR_SCENARIOS } from "./text-editor-cycle";

export const BUILTIN_SCENARIOS = [
  ...EDITOR_SCENARIOS,
  ...TEXT_EDITOR_SCENARIOS,
];
