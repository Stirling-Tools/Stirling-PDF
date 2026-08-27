import type { ToolId } from "@app/types/toolId";
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

/** Keyed by tool id: only entries that open a tool can be unavailable. */
export type QuickNavToolReasons = Partial<Record<ToolId, string>>;

export interface QuickNavIdentity {
  displayName: string;
  profilePictureUrl: string | null;
}

/** What the rail can't derive from the URL, published by the mounted app. */
export interface QuickNavHostData {
  /**
   * Whether an app has ever mounted under the frame. Sticky: a switch unmounts one
   * app a commit before the next registers, and clearing it there blinks the bar out.
   */
  appMounted: boolean;
  identity: QuickNavIdentity | null;
  signingBadge: number;
  portalAccess: boolean;
  readerMode: boolean;
  /**
   * Why a tool entry can't be used, keyed by entry id, already translated; absent
   * means it can. Unknown is drawn as usable - dimming a working control is worse
   * than briefly offering one that isn't.
   */
  toolReasons: QuickNavToolReasons;
  /**
   * Whether the app offers these. Flags rather than the handlers, because drawing
   * has to react to them and a ref write renders nothing.
   */
  hasSettings: boolean;
  hasTeams: boolean;
}

export interface QuickNavHostActions {
  openSettings?: () => void;
  openTeams?: () => void;
  /**
   * The editor reads its tool from the URL only on mount and popstate, so a
   * client-side navigation would set the address and select nothing. Absent in an
   * app with no tools; the rail then navigates, which lands as a fresh mount.
   */
  selectTool?: (toolId: ToolId) => void;
  setReaderMode?: (on: boolean) => void;
  /** The panel is rendered by the app, since a row's actions reach the workbench. */
  toggleNotifications?: () => void;
  /** No tool open, and the view the number of open files calls for. */
  goToDefaultState?: () => void;
  /** The editor's unsaved-changes guard; the processor has none. */
  requestNavigation?: (go: () => void) => void;
}

interface QuickNavHostValue extends QuickNavHostData {
  /**
   * Whether the route on screen carries no app chrome. Not part of the data above,
   * which persists across a switch on purpose - this has to lift the moment such a
   * route leaves.
   */
  chromeless: boolean;
  setChromeless: (chromeless: boolean) => void;
  /**
   * A ref, not state: swapping handlers changes nothing on screen, and reading them
   * at call time means a click reaches the app actually mounted.
   */
  actions: React.RefObject<QuickNavHostActions>;
  setData: (data: Partial<QuickNavHostData>) => void;
  setActions: (actions: QuickNavHostActions) => void;
}

const EMPTY_REASONS: QuickNavToolReasons = {};

const EMPTY_DATA: QuickNavHostData = {
  appMounted: false,
  toolReasons: EMPTY_REASONS,
  identity: null,
  signingBadge: 0,
  portalAccess: false,
  readerMode: false,
  hasSettings: false,
  hasTeams: false,
};

function sameReasons(
  next: QuickNavToolReasons,
  prev: QuickNavToolReasons,
): boolean {
  const nextKeys = Object.keys(next);
  if (nextKeys.length !== Object.keys(prev).length) return false;
  return nextKeys.every((key) => next[key as ToolId] === prev[key as ToolId]);
}

const QuickNavHostContext = createContext<QuickNavHostValue | null>(null);

/**
 * Holds what the quick nav rail needs from the app around it. The rail renders
 * above the route split, so it sits outside both apps' providers and can't read
 * their contexts; each app registers what only it knows.
 *
 * Data survives an app unmounting - blanking the avatar mid-switch would undo the
 * continuity the hoist is for. Actions don't: calling into a torn-down tree isn't
 * harmless.
 */
export function QuickNavHostProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<QuickNavHostData>(EMPTY_DATA);
  const [chromeless, setChromelessState] = useState(false);
  const actions = useRef<QuickNavHostActions>({});

  const setData = useCallback((next: Partial<QuickNavHostData>) => {
    setDataState((prev) => {
      const merged = { ...prev, ...next };
      const unchanged =
        merged.appMounted === prev.appMounted &&
        merged.signingBadge === prev.signingBadge &&
        merged.portalAccess === prev.portalAccess &&
        merged.readerMode === prev.readerMode &&
        merged.hasSettings === prev.hasSettings &&
        merged.hasTeams === prev.hasTeams &&
        merged.identity?.displayName === prev.identity?.displayName &&
        merged.identity?.profilePictureUrl ===
          prev.identity?.profilePictureUrl &&
        // By value: callers rebuild this map each render, and comparing references
        // would publish → render → rebuild → publish forever.
        sameReasons(merged.toolReasons, prev.toolReasons);
      return unchanged ? prev : merged;
    });
  }, []);

  const setActions = useCallback((next: QuickNavHostActions) => {
    actions.current = next;
  }, []);

  const setChromeless = useCallback((next: boolean) => {
    setChromelessState(next);
  }, []);

  const value = useMemo<QuickNavHostValue>(
    () => ({
      ...data,
      chromeless,
      actions,
      setData,
      setActions,
      setChromeless,
    }),
    [data, chromeless, setData, setActions, setChromeless],
  );

  return (
    <QuickNavHostContext.Provider value={value}>
      {children}
    </QuickNavHostContext.Provider>
  );
}

/** Null outside the provider. */
export function useQuickNavHost(): QuickNavHostValue | null {
  return useContext(QuickNavHostContext);
}

/** Publishes an app's state to the rail. No-ops outside the provider. */
export function useRegisterQuickNavHost(
  data: Partial<QuickNavHostData>,
  actions: QuickNavHostActions,
): void {
  const host = useQuickNavHost();
  const { identity, signingBadge, portalAccess, readerMode, toolReasons } =
    data;
  const hasSettings = Boolean(actions.openSettings);
  const hasTeams = Boolean(actions.openTeams);

  useEffect(() => {
    host?.setData({
      appMounted: true,
      identity: identity ?? null,
      signingBadge: signingBadge ?? 0,
      portalAccess: portalAccess ?? false,
      readerMode: readerMode ?? false,
      // Omitted when the app has no answer, so setData keeps the last one: a
      // switch empties the query cache, and the bar must not change what it says
      // while it is merely being re-fetched.
      ...(toolReasons ? { toolReasons } : {}),
      hasSettings,
      hasTeams,
    });
    // Identity by field, not by reference: it is rebuilt every render.
  }, [
    host,
    identity?.displayName,
    identity?.profilePictureUrl,
    signingBadge,
    portalAccess,
    readerMode,
    toolReasons,
    hasSettings,
    hasTeams,
  ]);

  const setActions = host?.setActions;

  // No deps, so a click reaches the current closure. A ref write only, and no
  // cleanup: one that touched state would fight the effect above it forever.
  useEffect(() => {
    setActions?.(actions);
  });

  // Handlers only. The draw flags are left for the incoming app to correct;
  // clearing them here made the teams and account controls blink mid-switch.
  useEffect(
    () => () => {
      setActions?.({});
    },
    [setActions],
  );
}

/**
 * Hides the rail while a route that isn't the app is on screen. `appMounted` is
 * sticky, so it can't also answer "is an app on screen now" - these routes say so
 * themselves.
 */
export function useSuppressQuickNavRail(): void {
  const host = useQuickNavHost();
  const setChromeless = host?.setChromeless;
  useEffect(() => {
    setChromeless?.(true);
    return () => setChromeless?.(false);
  }, [setChromeless]);
}
