/** Serves the gallery's "in use" list as `virtual:used-icons`, rescanned at every Storybook start. */
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
