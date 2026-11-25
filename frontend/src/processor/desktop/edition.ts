import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
} from "react";
import {
  connectionModeService,
  type ConnectionMode,
} from "@editor/services/connectionModeService";

/**
 * The processor edition a desktop connection runs. Web builds pick one edition
 * at build time; desktop connects to either, so its seams choose at runtime:
 * `cloud` (Stirling Cloud, the processor/cloud implementations) or `server` (a
 * self-hosted server, the base portal implementations).
 */
export type ProcessorEdition = "cloud" | "server";

/** Null in local mode and before the mode has loaded: there is no processor then. */
export function editionForMode(
  mode: ConnectionMode | null,
): ProcessorEdition | null {
  if (mode === "saas") return "cloud";
  if (mode === "selfhosted") return "server";
  return null;
}

/** For non-hook seams (api modules, values read at call time). */
export function currentEdition(): ProcessorEdition | null {
  return editionForMode(connectionModeService.getCachedMode());
}

/** Undefined outside a ProcessorEditionBoundary; the boundary provides null in local mode. */
export const ProcessorEditionContext = createContext<
  ProcessorEdition | null | undefined
>(undefined);

/**
 * The enclosing {@link ProcessorEditionBoundary}'s edition. Outside one, a
 * mode switch would swap a mounted component's implementation and change its
 * hook order, so dev and test builds report it (the tests fail on console
 * errors) and production falls back to the cached mode.
 */
export function useProcessorEdition(): ProcessorEdition | null {
  const edition = useContext(ProcessorEditionContext);
  if (edition !== undefined) return edition;
  if (import.meta.env.DEV) {
    console.error(
      "[processor] An edition hook or component rendered outside ProcessorEditionBoundary. Render it under DesktopProcessor or a PortalSettingsSectionHost.",
    );
  }
  return currentEdition();
}

/**
 * One hook seam with an implementation per edition. Only safe inside a
 * ProcessorEditionBoundary: the boundary remounts its subtree whenever the
 * edition changes, so a mounted component never switches implementation, which
 * would change its hook order. In local mode the base implementation runs.
 */
export function editionHook<A extends unknown[], R>(
  cloud: (...args: A) => R,
  server: (...args: A) => R,
): (...args: A) => R {
  return function useEditionHook(...args: A): R {
    const implementation = useProcessorEdition() === "cloud" ? cloud : server;
    return implementation(...args);
  };
}

/** {@link editionHook} for plain functions, chosen on each call from the cached mode. */
export function editionFunction<A extends unknown[], R>(
  cloud: (...args: A) => R,
  server: (...args: A) => R,
): (...args: A) => R {
  return (...args: A): R =>
    currentEdition() === "cloud" ? cloud(...args) : server(...args);
}

/** {@link editionHook} for a component seam. Switching the component type
 *  remounts it, so a change of edition never reuses the other one's state. */
export function editionComponent<P extends object>(
  cloud: ComponentType<P>,
  server: ComponentType<P>,
): ComponentType<P> {
  return function EditionComponent(props: P) {
    return createElement(
      useProcessorEdition() === "cloud" ? cloud : server,
      props,
    );
  };
}
