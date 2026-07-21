import { beforeAll } from "vitest";
import { setProjectAnnotations } from "@storybook/react-vite";
// eslint-disable-next-line no-restricted-imports -- Storybook-only: the sibling preview config has no @-alias.
import * as projectAnnotations from "./preview";

// Apply the same decorators/parameters/globals the Storybook UI uses (providers,
// i18n, theme) so stories run under Vitest render identically to the browser.
const project = setProjectAnnotations([projectAnnotations]);

beforeAll(project.beforeAll);
