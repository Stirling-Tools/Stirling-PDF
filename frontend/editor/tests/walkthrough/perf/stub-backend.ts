/**
 * The repo's API stubs, served over HTTP.
 *
 * A Lighthouse audit drives its own Chrome, so the Playwright route handlers the
 * interaction run relies on do not exist there and the app would paint its error
 * state instead of the feature. This server answers the same table
 * (`appApiStubs`) the Playwright helper registers, and mirrors
 * `fulfillUnstubbedApis` with the empty 500 the dead dev proxy sends, so an audit
 * and an interaction measure the same UI.
 */

import { createServer } from "node:http";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  appApiStubs,
  type AppApiStub,
  type MockAppApiOptions,
} from "@app/tests/helpers/api-stubs";

/** The dev server proxies `/api` here unless launched with another `BACKEND_URL`. */
export const DEFAULT_STUB_PORT = 8080;

/**
 * Whether a Playwright URL glob covers a path. The stubs only use three shapes
 * (a leading double-star prefix, an optional trailing wildcard, and an optional
 * trailing path wildcard), so a full glob engine would be unread code: a pattern
 * whose final character is a wildcard is a prefix match, and a pattern without
 * one is an exact match.
 */
export function matchStubPath(glob: string, pathname: string): boolean {
  const pattern = glob.startsWith("**") ? glob.slice(2) : glob;
  const [literal = ""] = pattern.split("*");
  return literal === pattern
    ? pathname === pattern
    : pathname.startsWith(literal);
}

/**
 * The stub that answers `pathname`, or `null`. Scanned in reverse because
 * Playwright keeps the *last* handler that matches, so the last entry in the
 * table wins for a path several globs cover.
 */
export function stubFor(
  pathname: string,
  stubs: AppApiStub[],
): AppApiStub | null {
  for (let index = stubs.length - 1; index >= 0; index -= 1) {
    const stub = stubs[index];
    if (stub && matchStubPath(stub.glob, pathname)) return stub;
  }
  return null;
}

export interface StubBackend {
  endpoint: string;
  port: number;
  close(): Promise<void>;
}

export interface StubBackendOptions {
  port?: number;
  host?: string;
  /** Defaults to the app's bootstrap stubs. */
  stubs?: AppApiStub[];
  stubOptions?: MockAppApiOptions;
}

/**
 * Starts the stub API server. Binds the port the dev server already proxies to,
 * so an audit can run against the UI without a backend process; a caller that
 * holds a live backend should not start it at all.
 */
export async function startStubBackend(
  options: StubBackendOptions = {},
): Promise<StubBackend> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? DEFAULT_STUB_PORT;
  const stubs = options.stubs ?? appApiStubs(options.stubOptions ?? {});

  const server = createServer((request, response) => {
    // A cancelled audit request must not surface as an unhandled socket error.
    request.on("error", () => undefined);
    const pathname = new URL(request.url ?? "/", `http://${host}`).pathname;
    const stub = stubFor(pathname, stubs);
    if (stub) {
      respond(response, 200, JSON.stringify(stub.body), "application/json");
      return;
    }
    if (pathname.startsWith("/api/v1/")) {
      respond(response, 500, "", "text/plain");
      return;
    }
    respond(response, 404, "", "text/plain");
  });

  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error): void => reject(error);
    server.once("error", failed);
    server.listen(port, host, () => {
      server.off("error", failed);
      resolve();
    });
  });

  // Port 0 (the self-test) gets one assigned, so the reported port is the bound
  // one rather than the requested one.
  const address = server.address();
  const boundPort =
    typeof address === "object" && address ? address.port : port;

  return {
    endpoint: `http://${host}:${boundPort}`,
    port: boundPort,
    close: (): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function respond(
  response: import("node:http").ServerResponse,
  status: number,
  body: string,
  contentType: string,
): void {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}
