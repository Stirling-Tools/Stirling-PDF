/**
 * Keeps the repo's stub API server alive for a manual audit session, so a
 * standalone Lighthouse run and `vite preview` can share one backend without
 * the CLI driving an interaction first.
 */

import { startStubBackend } from "./stub-backend";

const stub = await startStubBackend({
  port: Number(process.env.STUB_PORT ?? 8080),
});
process.stderr.write(`[stubs] listening on ${stub.endpoint}\n`);
