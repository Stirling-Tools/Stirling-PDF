/** Serves the registry gallery its "in use" list as `virtual:used-icons`,
 * scanned when Storybook starts. Computed rather than committed: it is a view
 * of the source tree, and a checked-in copy would drift the moment anyone
 * added a call site. Nothing in the app bundle imports it. */
import path from "node:path";

// oxlint-disable-next-line no-restricted-imports -- vite plugin; runs in node, where @app/* does not resolve
import { registryNames, scanUsedIcons } from "./usedIcons.mjs";

const VIRTUAL_ID = "virtual:used-icons";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

const GENERATED = [
  "registry.generated.ts",
  "stirlingIcons.generated.ts",
  "thirdPartyIcons.generated.ts",
];

/** @param {string} srcDir editor/src */
export function usedIconsPlugin(srcDir) {
  const iconsDir = path.join(srcDir, "core/icons");
  return {
    name: "used-icons",
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const known = new Set(
        GENERATED.flatMap((f) => registryNames(path.join(iconsDir, f))),
      );
      const used = [...scanUsedIcons(srcDir, known)].sort();
      return `export default ${JSON.stringify(used)};`;
    },
  };
}
