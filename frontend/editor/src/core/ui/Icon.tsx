import {
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
  type SVGProps,
} from "react";

import { COLORLESS_CLASS } from "@app/icons/colorless";
import { DEFAULT_SIZE, STROKE_WIDTH } from "@app/icons/icons.config";
import { ICON_NAMES } from "@app/icons/iconNames";
import { StartupIcon } from "@app/icons/StartupIcon";
import {
  PLACEHOLDER_ICON_BODY,
  SELF_PAINTED_ICON_NAMES,
  STARTUP_ICON_BODIES,
} from "@app/icons/startupIcons.generated";
import type { IconName } from "@app/icons/icons";

export { DEFAULT_SIZE, STROKE_WIDTH, type IconName };

export interface IconProps {
  name: IconName;
  /** Rendered width and height in px, or any CSS length. */
  size?: number | string;
  /** Overrides the app-wide stroke weight. Ignored by brand marks. */
  strokeWidth?: number;
  /** Fills a stroke icon with currentColor, for a toggle's on state. */
  filled?: boolean;
  /** Dims a brand mark, for a source that is off or unavailable. Stroke icons ignore it. */
  colorless?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; without one the icon is aria-hidden. */
  title?: string;
}

type IconEntry = {
  Component: ComponentType<SVGProps<SVGSVGElement>>;
  kind: "lucide" | "stirling" | "brand";
};

// The generated table is a plain index signature, so reads go through an
// optional value: a name outside the startup set is absent, not `undefined`
// by accident.
const STARTUP_BODIES: Readonly<Record<string, string | undefined>> =
  STARTUP_ICON_BODIES;

let registry: Readonly<Record<string, IconEntry | undefined>> | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

/**
 * Loads the complete map from `src/core/icons/icons.ts`.
 *
 * The landing screen paints about 70 names, so the entry chunk carries only
 * their markup (`startupIcons.generated.ts`); this starts on the first name
 * outside that subset and the remaining ~340 arrive with the screen that needs
 * them. Settles on failure too, leaving the name's empty box in place; the next
 * miss retries.
 */
export function loadIconRegistry(): Promise<void> {
  pending ??= import("@app/icons/icons").then(
    (module) => {
      registry = module.ICONS;
      pending = null;
      for (const listener of listeners) listener();
    },
    () => {
      pending = null;
    },
  );
  return pending;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function loadedRegistry(): Readonly<
  Record<string, IconEntry | undefined>
> | null {
  return registry;
}

/** Narrows a name-or-node prop: ReactNode includes string, so typeof cannot. */
export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && ICON_NAMES.has(value);
}

/** Drawn for a name no map can resolve, instead of throwing. */
export const MISSING_ICON: IconName = "circle-dashed";

const reported = new Set<string>();

function reportUnknown(name: string): void {
  // Once per name: the same bad value re-renders constantly in a list.
  if (import.meta.env.DEV && !reported.has(name)) {
    reported.add(name);
    console.error(
      `Icon: "${name}" is not in the icon map, drawing the placeholder instead. Fix the name, or add the svg to src/core/icons/svg/ and a line to src/core/icons/icons.ts.`,
    );
  }
}

/** The only icon component: every name in src/core/icons/icons.ts. */
export function Icon({
  name,
  size = DEFAULT_SIZE,
  strokeWidth = STROKE_WIDTH,
  filled = false,
  colorless = false,
  className,
  style,
  title,
}: IconProps) {
  // Subscribing to the registry rather than holding state keeps an icon that
  // arrives late from re-rendering its route: only this svg re-renders.
  const loaded = useSyncExternalStore(subscribe, loadedRegistry);
  const known = isIconName(name);
  // The startup markup answers for the names the landing screen paints, so the
  // registry is only consulted for a name outside that subset.
  const startupBody = STARTUP_BODIES[name];
  const entry = startupBody === undefined ? loaded?.[name] : undefined;
  if (startupBody === undefined && !entry) {
    // A registered name that is not here yet is what starts the fetch; an
    // unregistered one draws the placeholder whatever the registry holds.
    if (known) void loadIconRegistry();
    else reportUnknown(name);
  }
  const brand = entry
    ? entry.kind === "brand"
    : SELF_PAINTED_ICON_NAMES.has(name);
  const shared: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    // A brand mark paints itself, so the weight and fill would flatten it.
    ...(brand ? {} : { strokeWidth, fill: filled ? "currentColor" : "none" }),
    className:
      colorless && brand
        ? [COLORLESS_CLASS, className].filter(Boolean).join(" ")
        : className,
    style,
    focusable: false,
    "aria-hidden": title ? undefined : true,
    role: title ? "img" : undefined,
    "aria-label": title,
  };

  if (!entry) {
    // An unresolvable name draws the placeholder's own markup rather than a
    // registry component, so it stays correct while the fetch is in flight.
    return (
      <StartupIcon
        body={startupBody ?? PLACEHOLDER_ICON_BODY}
        selfPainted={brand}
        data-missing-icon={known ? undefined : name}
        {...shared}
      />
    );
  }

  const { Component } = entry;
  return <Component data-missing-icon={known ? undefined : name} {...shared} />;
}
