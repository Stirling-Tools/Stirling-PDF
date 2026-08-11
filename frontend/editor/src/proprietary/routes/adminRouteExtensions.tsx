import { lazy } from "react";
import type { ReactElement } from "react";
import { Route } from "react-router-dom";
import { PROCESSOR_BASENAME } from "@app/routes/processorBasename";

// The processor ships as a lazy chunk of the editor. It's included in dev (so it's
// always available to work on) and in production builds made with
// VITE_INCLUDE_PROCESSOR=true (set by -PbuildWithProcessor in the JAR, and by the deploy
// GHA when the processor or AI layers change). Vite replaces the env with a literal at
// build time, so when it's off the dynamic import below is tree-shaken out and the
// processor chunk isn't emitted. ProcessorApp stays module-level so it isn't recreated on
// each render.
const includeProcessor =
  import.meta.env.VITE_INCLUDE_PROCESSOR === "true" || import.meta.env.DEV;

const ProcessorApp = includeProcessor
  ? lazy(async () => {
      const m = await import("@processor/ProcessorApp");
      return { default: m.ProcessorApp };
    })
  : null;

/**
 * The processor mounts as an admin-only route-set at PROCESSOR_BASENAME (/processor/*).
 * Access is gated inside ProcessorApp (its own AuthProvider + AuthGate, plus server
 * enforcement), so this just wires the lazy route into the editor's router when
 * the processor is included in this build.
 */
export function getAdminRouteExtensions(): ReactElement[] {
  if (!ProcessorApp) return [];
  return [
    <Route
      key="processor"
      path={`${PROCESSOR_BASENAME}/*`}
      element={<ProcessorApp />}
    />,
  ];
}
