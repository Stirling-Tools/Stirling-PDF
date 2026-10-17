/**
 * The bootstrap stubs with a multi-language server config, so a locale probe can
 * see what a visitor loads when the server does not pin en-US.
 *
 * A real install advertises its own language list and default; the default boot
 * stubs pin `languages: ["en-US"]`, which forces every visitor onto the source
 * dictionary and hides the delivery-file behaviour.
 */

import { appApiStubs } from "@app/tests/helpers/api-stubs";
// oxlint-disable-next-line no-restricted-imports -- probe server, outside the app aliases
import { startStubBackend } from "./stub-backend";

const port = Number(process.env.STUB_PORT ?? 8081);
// The shipped defaults: `system.defaultLocale: ""` (detect from the browser)
// and `ui.languages: []` (no restriction).
const languages = process.env.STUB_LANGUAGES
  ? JSON.parse(process.env.STUB_LANGUAGES)
  : [];
const defaultLocale = process.env.STUB_DEFAULT_LOCALE ?? "";

const stubs = appApiStubs().map((stub) =>
  stub.glob.includes("app-config")
    ? {
        ...stub,
        body: { ...stub.body, languages, defaultLocale },
      }
    : stub,
);

const server = await startStubBackend({ port, stubs });
console.log(`[stubs-open] listening on ${server.endpoint}`);
