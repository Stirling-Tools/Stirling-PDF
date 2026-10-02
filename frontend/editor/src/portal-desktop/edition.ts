import { createContext, useContext } from "react";
import {
  connectionModeService,
  type ConnectionMode,
} from "@app/services/connectionModeService";

/**
 * The processor edition a desktop connection runs. Web builds pick one edition
 * at build time; desktop connects to either, so its seams choose at runtime:
 * `cloud` (Stirling Cloud, the portal-cloud implementations) or `server` (a
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

export const ProcessorEditionContext = createContext<ProcessorEdition | null>(
  null,
);

/** The enclosing {@link ProcessorEditionBoundary}'s edition, else the cached mode's. */
export function useProcessorEdition(): ProcessorEdition | null {
  return useContext(ProcessorEditionContext) ?? currentEdition();
}

/**
 * One hook seam with an implementation per edition. Only safe inside a
 * ProcessorEditionBoundary: the boundary remounts its subtree whenever the
 * edition changes, so a mounted component never switches implementation, which
 * would change its hook order. Outside one (local mode) the base implementation
 * runs.
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

/**
 * {@link editionFunction} for a seam that is an object of methods or flags.
 * Every property read (including spreads) is forwarded to the current
 * edition's object, so callers that read it at render or call time follow the
 * connection; a value captured at module load would not.
 */
export function editionObject<T extends object>(cloud: T, server: T): T {
  const pick = (): T => (currentEdition() === "cloud" ? cloud : server);
  return new Proxy(server, {
    get: (_target, key) => Reflect.get(pick(), key),
    has: (_target, key) => Reflect.has(pick(), key),
    ownKeys: () => Reflect.ownKeys(pick()),
    getOwnPropertyDescriptor: (_target, key) =>
      Reflect.getOwnPropertyDescriptor(pick(), key),
  });
}
