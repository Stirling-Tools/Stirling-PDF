import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
  type ComponentProps,
} from "react";

/**
 * `React.lazy` for anything reached from the landing screen.
 *
 * The startup subset carries only the keys the landing screen resolves, so a
 * feature must not render before the complete dictionary is in memory. Awaiting
 * the chunk and the dictionary together keeps the route's existing suspense
 * fallback covering both, and the two requests run in parallel, so a direct link
 * to a tool costs no extra round trip.
 *
 * The dictionary comes from a dynamic import so that a module which only names
 * routes - the tool registry, a layout - does not pull the i18n runtime into its
 * own graph. Importing it here instead would initialise i18next as a side effect
 * of reading the route table, in every environment, for code that may never
 * render.
 */
export function translatedLazy<T extends ComponentType<ComponentProps<T>>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const [route] = await Promise.all([
      load(),
      import("@app/i18n").then((module) => module.loadFullDictionary()),
    ]);
    return route;
  });
}
