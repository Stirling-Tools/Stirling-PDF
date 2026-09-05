import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { preloadAdminRoutes } from "@app/routes/adminRouteExtensions";
import { preferencesService } from "@app/services/preferencesService";
import {
  APP_SWITCH_PINS_BRAND,
  DEFAULT_APP_SWITCH_STYLE,
  isAppSwitchStyle,
  type AppSwitchStyle,
} from "@app/constants/appSwitchStyle";
import "@app/components/shared/AppSwitchTransition.css";

/** The two apps this SPA hosts, each at its own URL. */
export type AppZone = "editor" | "processor";

/** Left-to-right order of the apps; a switch slides along this axis. */
const ZONE_ORDER: AppZone[] = ["editor", "processor"];

/**
 * The two halves of the outbound move, mirroring AppSwitchTransition.css: a
 * quick departure, then a longer, settling arrival. Going back plays the whole
 * thing backwards, which swaps them (see {@link halvesFor}).
 */
const DEPART_MS = 220;
const ARRIVE_MS = 320;
/**
 * Total time the exit may hold on its last frame waiting for the app being
 * entered - first for its code, then for its shell to actually paint. Holding
 * shows app chrome (or the curtain); waiting forever would strand the user, so
 * past this we reveal whatever is there.
 */
const MAX_HOLD_MS = 1200;

/** The rail and the brand lockup each app draws at its top-left. */
const RAIL_SELECTOR = ".file-sidebar, .portal-sidebar";
const BRAND_SELECTOR = ".quick-nav-brand";

type Phase = "idle" | "exit" | "enter";
type Direction = "forward" | "back";

/**
 * How long each half runs for a move in this direction, as
 * [outgoing, incoming]. Going back IS the outbound move rewound - the arrival
 * un-arrives, then the departure un-departs - so its halves are the forward
 * ones in the opposite order.
 */
function halvesFor(direction: Direction): [number, number] {
  return direction === "forward"
    ? [DEPART_MS, ARRIVE_MS]
    : [ARRIVE_MS, DEPART_MS];
}

interface AppSwitchValue {
  /**
   * Move to the other app with the cross-app transition. `path` overrides the
   * landing route (defaults to that app's home).
   */
  switchToApp: (zone: AppZone, path?: string) => void;
  /**
   * Warm an app's code ahead of a switch. Call it on intent (opening the
   * switcher menu) so the arrival has nothing left to fetch.
   */
  preloadApp: (zone: AppZone) => void;
}

const AppSwitchContext = createContext<AppSwitchValue | null>(null);

/** Frozen copy of the brand lockup, so it can be held still across the swap. */
interface BrandSnapshot {
  node: HTMLElement;
  railWidth: number;
  rowHeight: number;
  left: number;
  top: number;
}

export function zoneForPath(pathname: string): AppZone {
  return pathname === PORTAL_BASENAME ||
    pathname.startsWith(`${PORTAL_BASENAME}/`)
    ? "processor"
    : "editor";
}

function homePathFor(zone: AppZone): string {
  return zone === "processor" ? PORTAL_BASENAME : EDITOR_BASENAME;
}

/**
 * Read fresh at the start of each switch rather than subscribed to: the provider
 * sits above PreferencesProvider (it wraps the whole app), and the style is only
 * ever needed at the moment a switch begins.
 */
function currentStyle(): AppSwitchStyle {
  const stored = preferencesService.getPreference("appSwitchStyle");
  return isAppSwitchStyle(stored) ? stored : DEFAULT_APP_SWITCH_STYLE;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Lifts the live brand lockup out of the DOM as an inert clone, plus the rail
 * geometry around it. Measuring rather than hard-coding is what lets the
 * stand-in land on the real lockup in both apps, collapsed rail included.
 */
function snapshotBrand(): BrandSnapshot | null {
  const brand = document.querySelector<HTMLElement>(BRAND_SELECTOR);
  const rail = document.querySelector<HTMLElement>(RAIL_SELECTOR);
  if (!brand || !rail) return null;

  const brandRect = brand.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  if (!brandRect.width || !railRect.width) return null;

  const node = brand.cloneNode(true) as HTMLElement;
  // A menu may still be flagged open from the click that got us here; the clone
  // must show the mark at rest.
  node
    .querySelectorAll(".is-open")
    .forEach((el) => el.classList.remove("is-open"));

  return {
    node,
    railWidth: railRect.width,
    // The lockup is centred in its row, so mirroring its top inset gives the
    // row height without either shell having to declare one.
    rowHeight: brandRect.bottom + brandRect.top,
    left: brandRect.left,
    top: brandRect.top,
  };
}

/**
 * Calls `done` once the app being entered has painted its own rail - a shell is
 * up, not a spinner - or once the hold budget runs out, whichever is first.
 *
 * Watching the rail rather than a readiness callback keeps this app-agnostic:
 * both shells draw one, and neither draws it while booting. Compared against
 * the outgoing element because a navigation is committed asynchronously, so the
 * app being left can still be on screen for a frame or two afterwards.
 */
function waitForShell(
  outgoingRail: Element | null,
  deadline: number,
  done: () => void,
): () => void {
  let frame = 0;
  const check = () => {
    const rail = document.querySelector(RAIL_SELECTOR);
    if ((rail && rail !== outgoingRail) || Date.now() >= deadline) {
      done();
      return;
    }
    frame = requestAnimationFrame(check);
  };
  frame = requestAnimationFrame(check);
  return () => cancelAnimationFrame(frame);
}

/** Mounts the cloned lockup into the overlay box. */
function BrandStandIn({ snapshot }: { snapshot: BrandSnapshot }) {
  const mount = useCallback(
    (host: HTMLDivElement | null) => {
      if (host) host.appendChild(snapshot.node);
    },
    [snapshot],
  );

  return (
    <div
      className="app-switch-brand"
      style={{ width: snapshot.railWidth, height: snapshot.rowHeight }}
      aria-hidden
    >
      <div
        ref={mount}
        style={{ position: "absolute", left: snapshot.left, top: snapshot.top }}
      />
    </div>
  );
}

/**
 * Makes the editor and the processor feel like two rooms of one app rather than
 * two sites.
 *
 * They already are one SPA - the processor is a route-set mounted at
 * {@link PORTAL_BASENAME} inside the editor's router - but crossing between
 * them unmounted one shell and mounted the other with nothing in between, which
 * reads as a page load. This wraps the app in a layer that can be animated and
 * drives the crossing in three beats: the outgoing app pushes off and fades,
 * the URL changes, the incoming app arrives from the other side.
 *
 * Two details do the "same system" work. The chunk for the app being entered is
 * preloaded while the outgoing one is still animating, so the arrival is not
 * gated on a network round-trip. And the brand lockup - which both shells draw
 * at the same coordinates - is held still for the whole swap by an overlay
 * clone, so the chrome never appears to leave.
 *
 * Crossings that skip `switchToApp` (browser back/forward, a deep link) still
 * get the arrival half, so the two apps never hard-cut into each other.
 */
export function AppSwitchProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const zone = zoneForPath(location.pathname);

  const [phase, setPhase] = useState<Phase>("idle");
  const [direction, setDirection] = useState<Direction>("forward");
  const [style, setStyle] = useState<AppSwitchStyle>(DEFAULT_APP_SWITCH_STYLE);
  const [brand, setBrand] = useState<BrandSnapshot | null>(null);

  const timers = useRef<number[]>([]);
  const cancelShellWait = useRef<(() => void) | null>(null);
  const switching = useRef(false);
  const lastZone = useRef<AppZone>(zone);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
      cancelShellWait.current?.();
    },
    [],
  );

  const finish = useCallback(() => {
    cancelShellWait.current?.();
    cancelShellWait.current = null;
    setPhase("idle");
    setBrand(null);
    switching.current = false;
  }, []);

  // The editor is the main bundle, so only the processor has anything to fetch.
  const preloadApp = useCallback((target: AppZone) => {
    if (target === "processor") void preloadAdminRoutes();
  }, []);

  const switchToApp = useCallback(
    (target: AppZone, path?: string) => {
      const destination = path ?? homePathFor(target);
      // Kick the fetch off first so it overlaps the exit rather than stalling
      // the arrival (usually already warm - see preloadApp).
      const ready = target === "processor" ? preloadAdminRoutes() : null;

      // A switch already playing owns the screen until it settles - restarting
      // mid-flight would re-measure the brand off a transformed rail and jump
      // the URL ahead of the animation. Half a second of ignored clicks.
      if (switching.current) return;

      const from = zoneForPath(location.pathname);
      if (from === target || prefersReducedMotion()) {
        navigate(destination);
        return;
      }

      const direction: Direction =
        ZONE_ORDER.indexOf(target) > ZONE_ORDER.indexOf(from)
          ? "forward"
          : "back";
      const [outgoing, incoming] = halvesFor(direction);

      const chosen = currentStyle();
      switching.current = true;
      setDirection(direction);
      setStyle(chosen);
      // Styles that carry the chrome off screen would leave a pinned mark
      // hanging over nothing, so they opt out of the stand-in entirely.
      setBrand(APP_SWITCH_PINS_BRAND[chosen] ? snapshotBrand() : null);
      setPhase("exit");

      // One budget for the whole hold, so a slow chunk followed by a slow boot
      // still cannot strand the user behind a held frame.
      const deadline = Date.now() + MAX_HOLD_MS;

      const reveal = () => {
        if (!switching.current) return; // superseded or unmounted
        setPhase("enter");
        after(incoming, finish);
      };

      const arrive = () => {
        if (!switching.current) return;
        // The rail on screen right now belongs to the app being left; the new
        // one is a different element, which is how we tell the swap has painted
        // rather than merely been asked for.
        const outgoingRail = document.querySelector(RAIL_SELECTOR);
        navigate(destination);
        lastZone.current = target;
        // The incoming app mounts inside a zone still held on the exit's last
        // frame, so its boot states never reach the screen. Reveal it once its
        // shell is up - otherwise the arrival animates a loading screen and
        // then hard-cuts to the real thing. Worst under `wipe`, where the
        // curtain would draw back to show a spinner.
        cancelShellWait.current = waitForShell(outgoingRail, deadline, reveal);
      };

      // Arrive once the exit has played AND the incoming app is loadable, so an
      // unwarmed chunk holds the exit's last frame (app chrome) instead of
      // sliding a loading spinner in.
      after(outgoing, () => {
        if (!ready) return arrive();
        let arrived = false;
        const once = () => {
          if (arrived) return;
          arrived = true;
          arrive();
        };
        void ready.then(once);
        after(Math.max(0, deadline - Date.now()), once);
      });
    },
    [after, finish, location.pathname, navigate],
  );

  // Back/forward and in-app deep links cross the boundary without the switcher.
  // There is no outgoing app left to animate by the time this runs, but playing
  // the arrival still keeps the crossing from being a hard cut.
  useEffect(() => {
    const previous = lastZone.current;
    lastZone.current = zone;
    if (previous === zone || switching.current || prefersReducedMotion())
      return;

    const direction: Direction =
      ZONE_ORDER.indexOf(zone) > ZONE_ORDER.indexOf(previous)
        ? "forward"
        : "back";
    setDirection(direction);
    setStyle(currentStyle());
    switching.current = true;
    setPhase("enter");
    after(halvesFor(direction)[1], finish);
  }, [after, finish, zone]);

  const value = useMemo<AppSwitchValue>(
    () => ({ switchToApp, preloadApp }),
    [preloadApp, switchToApp],
  );

  return (
    <AppSwitchContext.Provider value={value}>
      {phase !== "idle" && (
        <div
          className="app-switch-ground"
          data-phase={phase}
          data-dir={direction}
          data-style={style}
          aria-hidden
        />
      )}
      <div
        className="app-zone"
        data-phase={phase}
        data-dir={direction}
        data-style={style}
      >
        {children}
      </div>
      {phase !== "idle" && brand && <BrandStandIn snapshot={brand} />}
    </AppSwitchContext.Provider>
  );
}

/**
 * The app switch. Outside the provider (Storybook, isolated tests) this falls
 * back to a plain navigation so callers never have to branch.
 */
export function useAppSwitch(): AppSwitchValue {
  const navigate = useNavigate();
  const ctx = useContext(AppSwitchContext);
  const fallback = useMemo<AppSwitchValue>(
    () => ({
      switchToApp: (target, path) => navigate(path ?? homePathFor(target)),
      preloadApp: () => {},
    }),
    [navigate],
  );
  return ctx ?? fallback;
}
