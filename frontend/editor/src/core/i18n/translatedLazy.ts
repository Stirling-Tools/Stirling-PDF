import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
  type ComponentProps,
} from "react";
import { loadFullDictionary } from "@app/i18n";

/**
 * `React.lazy` for anything reached from the landing screen.
 *
 * The startup subset carries only the keys the landing screen resolves, so a
 * feature must not render before the complete dictionary is in memory. Awaiting
 * the chunk and the dictionary together keeps the route's existing suspense
 * fallback covering both, and the two requests run in parallel, so a direct link
 * to a tool costs no extra round trip.
 */
export function translatedLazy<T extends ComponentType<ComponentProps<T>>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const [route] = await Promise.all([load(), loadFullDictionary()]);
    return route;
  });
}
