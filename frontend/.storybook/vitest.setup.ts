import { beforeAll } from "vitest";
import { setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
// eslint-disable-next-line no-restricted-imports -- Storybook-only: the sibling preview config has no @-alias.
import * as projectAnnotations from "./preview";

// Include addon-a11y's annotations so its axe checks run under Vitest, not only
// in the Storybook UI panel. projectAnnotations supplies the same
// decorators/parameters/globals (providers, i18n, theme) as the browser.
const project = setProjectAnnotations([
  a11yAddonAnnotations,
  projectAnnotations,
]);

beforeAll(project.beforeAll);
