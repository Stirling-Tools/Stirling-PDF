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

/** Identity for the rail's account control. */
export interface QuickNavIdentity {
  displayName: string;
  profilePictureUrl: string | null;
}

/**
 * Things the rail can only learn from whichever app is currently mounted.
 * Everything else it needs - which entries exist, where they go, which is
 * current - it derives from the URL, so it does not depend on either app.
 */
export interface QuickNavHostData {
  /**
   * Whether an app has ever mounted under this frame.
   *
   * The rail is drawn above the route split, so without this it would also
   * appear over login, over error states, and when the backend can't be reached -
   * a navigation bar for an app that isn't running. Sticky once true: a switch
   * unmounts one app before the next registers, and clearing it there would blink
   * the bar out at exactly the moment the hoist exists to keep it still.
   */
  appMounted: boolean;
  identity: QuickNavIdentity | null;
  signingBadge: number;
  /** Whether this user may open the processor. */
  portalAccess: boolean;
  /**
   * Whether the app is in reading mode - chrome collapsed around the document.
   * Deliberately absent from the URL: it is a display toggle like collapsing the
   * sidebar, not a place, and nothing outside the session needs to know it.
   */
  readerMode: boolean;
  /**
   * Whether the mounted app offers these at all. Booleans rather than the
   * handlers themselves: the rail decides what to *draw* from these, and drawing
   * has to react to them arriving - the handlers live in a ref, and writing a ref
   * renders nothing.
   */
  hasSettings: boolean;
  hasTeams: boolean;
}

export interface QuickNavHostActions {
  openSettings?: () => void;
  openTeams?: () => void;
  /**
   * Opens one of the app's tools. Necessary because the editor reads the URL for
   * a tool only on mount and on popstate - a client-side navigation sets the
   * address but selects nothing, and its own "URL follows the tool" effect then
   * writes the address back. Absent in an app that has no tools of its own, and
   * then the rail navigates instead, which lands as a fresh mount and syncs.
   */
  selectTool?: (toolId: string) => void;
  /** Turns reading mode on or off. */
  setReaderMode?: (on: boolean) => void;
  /**
   * Returns the app to its default state: no tool open, and the view the current
   * number of open files calls for. The app owns this because only it knows what
   * is open - the rail can't work it out from the URL.
   */
  goToDefaultState?: () => void;
  /**
   * The editor's unsaved-changes guard. Absent in the processor, which has no
   * in-progress document work to lose.
   */
  requestNavigation?: (go: () => void) => void;
}

interface QuickNavHostValue extends QuickNavHostData {
  /**
   * Held in a ref, not state: swapping handlers as apps mount does not change
   * what the bar looks like, and reading them at call time means a click always
   * reaches the app that is actually on screen.
   */
  actions: React.RefObject<QuickNavHostActions>;
  setData: (data: Partial<QuickNavHostData>) => void;
  setActions: (actions: QuickNavHostActions) => void;
}

const EMPTY_DATA: QuickNavHostData = {
  appMounted: false,
  identity: null,
  signingBadge: 0,
  portalAccess: false,
  readerMode: false,
  hasSettings: false,
  hasTeams: false,
};

const QuickNavHostContext = createContext<QuickNavHostValue | null>(null);

/**
 * Holds what the quick nav rail needs from the app around it.
 *
 * The rail is rendered above the route split so it survives switching between
 * the editor and the processor - which means it sits outside both apps'
 * providers and can't read their contexts. Each app registers what only it
 * knows; the rail reads it from here.
 *
 * Data deliberately persists when an app unmounts: during a switch there is a
 * moment with no app registered, and blanking the avatar and badge would undo
 * the very continuity the hoist is for. Actions are cleared, because calling a
 * handler belonging to a torn-down tree is not the same kind of harmless.
 */
export function QuickNavHostProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<QuickNavHostData>(EMPTY_DATA);
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
        merged.identity?.profilePictureUrl === prev.identity?.profilePictureUrl;
      return unchanged ? prev : merged;
    });
  }, []);

  const setActions = useCallback((next: QuickNavHostActions) => {
    actions.current = next;
  }, []);

  const value = useMemo<QuickNavHostValue>(
    () => ({ ...data, actions, setData, setActions }),
    [data, setData, setActions],
  );

  return (
    <QuickNavHostContext.Provider value={value}>
      {children}
    </QuickNavHostContext.Provider>
  );
}

/** Read what the host apps have registered. Null outside the provider. */
export function useQuickNavHost(): QuickNavHostValue | null {
  return useContext(QuickNavHostContext);
}

/**
 * Called by whichever app is mounted to publish what the rail can't derive from
 * the URL. Safe to call outside the provider (mobile layouts, tests): it no-ops.
 */
export function useRegisterQuickNavHost(
  data: Partial<QuickNavHostData>,
  actions: QuickNavHostActions,
): void {
  const host = useQuickNavHost();
  const { identity, signingBadge, portalAccess, readerMode } = data;
  const hasSettings = Boolean(actions.openSettings);
  const hasTeams = Boolean(actions.openTeams);

  // Depend on the identity's fields rather than its object: callers build it
  // fresh each render, and depending on the reference would loop.
  useEffect(() => {
    host?.setData({
      appMounted: true,
      identity: identity ?? null,
      signingBadge: signingBadge ?? 0,
      portalAccess: portalAccess ?? false,
      readerMode: readerMode ?? false,
      hasSettings,
      hasTeams,
    });
  }, [
    host,
    identity?.displayName,
    identity?.profilePictureUrl,
    signingBadge,
    portalAccess,
    readerMode,
    hasSettings,
    hasTeams,
  ]);

  const setActions = host?.setActions;

  // Re-registered on every render, deliberately without deps, so a click always
  // reaches the current closure. A ref write only - and with NO cleanup, because
  // a cleanup that touched state here would run between every render and fight
  // the effect below it, re-rendering forever.
  useEffect(() => {
    setActions?.(actions);
  });

  // Handlers are dropped on unmount so a click can't reach a torn-down tree.
  // The flags that decide what the bar DRAWS are deliberately left alone: an app
  // switch unmounts one app a commit before the next registers, and clearing them
  // there made the teams and account controls vanish and reappear - the exact
  // blink the hoisted bar exists to avoid. The incoming app sets them to its own
  // truth as it arrives, so they self-correct rather than needing clearing. A
  // click inside that one-commit gap finds no handler and does nothing.
  useEffect(
    () => () => {
      setActions?.({});
    },
    [setActions],
  );
}
