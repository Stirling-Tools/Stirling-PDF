// Root Vitest config so the Storybook addon-vitest Testing UI (and a bare
// `vitest` run from frontend/) discovers the Storybook browser-test project.
// The project definition lives in .storybook/vitest.config.ts; this re-exports
// it from the conventional root location. The editor unit tests are separate
// (editor/vitest.config.ts, run with `vitest --root editor`).
// eslint-disable-next-line no-restricted-imports -- config re-export; no @-alias covers .storybook/
export { default } from "./.storybook/vitest.config";
