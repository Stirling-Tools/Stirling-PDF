import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
  type ComponentProps,
} from "react";

/** `React.lazy` for anything reached from the landing screen. */
export function translatedLazy<T extends ComponentType<ComponentProps<T>>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(load);
}
