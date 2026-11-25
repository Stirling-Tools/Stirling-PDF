type Flavor = "core" | "proprietary" | "saas" | "desktop";

interface FlavorBuild {
  /** tsconfig projects for `@editor/*`, relative to frontend/, first match wins. */
  projects: string[];
  /**
   * Directories `@processor/*` tries in order, relative to frontend/. Matches
   * the `@processor/*` paths of this flavour's tsconfig unless noted.
   */
  processorLayers: string[];
  /** Story globs relative to frontend/. */
  stories: string[];
}

/**
 * One Storybook build per app flavour, selected with STORYBOOK_FLAVOR and
 * defaulting to proprietary (self-hosted). A build resolves each `@editor/*`
 * import once, through that flavour's own tsconfig cascade, exactly as the app
 * build does, so the same story renders the flavour's real overrides with no
 * copy of the story.
 *
 * Each flavour lists only the stories its cascade resolves: shared stories in
 * core and proprietary, and a setup's own stories in its own layer. A story the
 * cascade cannot resolve fails Vite's dependency scan for the whole run, not
 * just itself.
 */
const FLAVORS: Record<Flavor, FlavorBuild> = {
  core: {
    // Preview infrastructure imports the portal and proprietary auth, which
    // resolve through the proprietary cascade; core's own stories do not.
    projects: [
      "tsconfig.storybook-proprietary.json",
      "tsconfig.core.vite.json",
    ],
    processorLayers: ["src/processor/proprietary"],
    stories: ["src/editor/core/**/*.stories.@(ts|tsx)"],
  },
  proprietary: {
    projects: ["tsconfig.proprietary.vite.json"],
    processorLayers: ["src/processor/proprietary"],
    stories: [
      "src/processor/proprietary/**/*.mdx",
      "src/processor/**/*.stories.@(ts|tsx)",
      "src/editor/@(core|proprietary)/**/*.stories.@(ts|tsx)",
    ],
  },
  saas: {
    projects: ["tsconfig.saas.vite.json"],
    // Not the saas tsconfig's cascade: with the saas and cloud processor
    // layers, stories hang at auth start-up against the mock SaaS.
    processorLayers: ["src/processor/proprietary"],
    stories: [
      "src/editor/@(core|proprietary|cloud|saas)/**/*.stories.@(ts|tsx)",
    ],
  },
  desktop: {
    projects: ["tsconfig.desktop.vite.json"],
    processorLayers: ["src/processor/desktop", "src/processor/proprietary"],
    stories: [
      "src/editor/@(core|proprietary|cloud|desktop)/**/*.stories.@(ts|tsx)",
    ],
  },
};

function isFlavor(value: string): value is Flavor {
  return value in FLAVORS;
}

function selectedFlavor(): Flavor {
  const flavor = process.env.STORYBOOK_FLAVOR || "proprietary";
  if (!isFlavor(flavor))
    throw new Error(
      `STORYBOOK_FLAVOR must be one of ${Object.keys(FLAVORS).join(", ")}; got ${flavor}`,
    );
  return flavor;
}

export const flavor = selectedFlavor();
export const flavorBuild = FLAVORS[flavor];

/**
 * Tag for a shared story that shows a state this flavour cannot reach, such as
 * a server-saved signature library in SaaS, where signatures live in the
 * browser. The flavour's build leaves the story out of its sidebar and its test
 * run; the flavour's own state belongs in a story in its own layer.
 */
export const notInFlavorTag = `not-in-${flavor}`;

/**
 * Tag for a shared story that this flavour's app currently fails: the state is
 * reachable there, so the story stays in the sidebar, but its test is reported
 * as skipped rather than failing every run. Remove it with the app fix.
 */
export const brokenInFlavorTag = `broken-in-${flavor}`;
