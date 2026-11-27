import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

const BUILD_NAMES: Readonly<Record<string, string>> = {
  core: "core",
  proprietary: "self-hosted",
  saas: "SaaS",
  desktop: "desktop",
};

// Set by main.ts's managerHead, so each build's sidebar names the build.
const flavor =
  (window as { STORYBOOK_FLAVOR?: string }).STORYBOOK_FLAVOR ?? "proprietary";
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

addons.setConfig({
  theme: create({
    base: prefersDark ? "dark" : "light",
    brandTitle:
      '<span style="display:inline-flex;align-items:baseline;gap:0.4rem">' +
      "<strong>Storybook</strong>" +
      `<span style="font-size:0.75em;font-weight:400;opacity:0.6">${BUILD_NAMES[flavor] ?? flavor}</span>` +
      "</span>",
  }),
});
