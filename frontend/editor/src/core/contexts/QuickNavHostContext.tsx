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

export type QuickNavToolReasons = Partial<Record<ToolId, string>>;

export interface QuickNavIdentity {
  displayName: string;
  profilePictureUrl: string | null;
}

export interface QuickNavHostData {
  /** Sticky: a switch unmounts one app a commit before the next registers. */
  appMounted: boolean;
  identity: QuickNavIdentity | null;
  signingBadge: number;
  portalAccess: boolean;
  readerMode: boolean;
  /** So the bell can report it: the panel is rendered by the app, not the rail. */
  notificationsOpen: boolean;
  /** Translated; absent means usable. Unknown is drawn as usable, never dimmed. */
  toolReasons: QuickNavToolReasons;
  /** Flags, not the handlers: drawing has to react, and a ref write renders nothing. */
  hasSettings: boolean;
  hasTeams: boolean;
}

export interface QuickNavHostActions {
  openSettings?: () => void;
  openTeams?: () => void;
  /** The editor reads its tool from the URL only on mount, so navigating selects nothing. */
  selectTool?: (toolId: ToolId) => void;
  setReaderMode?: (on: boolean) => void;
  toggleNotifications?: () => void;
  goToDefaultState?: () => void;
  requestNavigation?: (go: () => void) => void;
}

interface QuickNavHostValue extends QuickNavHostData {
  /** Separate from the data above, which persists across a switch on purpose. */
  chromeless: boolean;
  setChromeless: (chromeless: boolean) => void;
  /** A ref, so a click reaches the app actually mounted. */
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
  notificationsOpen: false,
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
 * The rail renders above the route split, outside both apps' providers, so each app
 * registers what only it knows. Data survives an unmount; handlers do not.
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
        merged.notificationsOpen === prev.notificationsOpen &&
        merged.hasSettings === prev.hasSettings &&
        merged.hasTeams === prev.hasTeams &&
        merged.identity?.displayName === prev.identity?.displayName &&
        merged.identity?.profilePictureUrl ===
          prev.identity?.profilePictureUrl &&
        // By value: rebuilt each render, so references would loop.
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

export function useQuickNavHost(): QuickNavHostValue | null {
  return useContext(QuickNavHostContext);
}

/** No-ops outside the provider. */
export function useRegisterQuickNavHost(
  data: Partial<QuickNavHostData>,
  actions: QuickNavHostActions,
): void {
  const host = useQuickNavHost();
  const {
    identity,
    signingBadge,
    portalAccess,
    readerMode,
    notificationsOpen,
    toolReasons,
  } = data;
  const hasSettings = Boolean(actions.openSettings);
  const hasTeams = Boolean(actions.openTeams);

  useEffect(() => {
    host?.setData({
      appMounted: true,
      identity: identity ?? null,
      signingBadge: signingBadge ?? 0,
      portalAccess: portalAccess ?? false,
      readerMode: readerMode ?? false,
      notificationsOpen: notificationsOpen ?? false,
      // Omitted when unknown, so setData keeps the last answer through a re-fetch.
      ...(toolReasons ? { toolReasons } : {}),
      hasSettings,
      hasTeams,
    });
    // By field: identity is rebuilt every render.
  }, [
    host,
    identity?.displayName,
    identity?.profilePictureUrl,
    signingBadge,
    portalAccess,
    readerMode,
    notificationsOpen,
    toolReasons,
    hasSettings,
    hasTeams,
  ]);

  const setActions = host?.setActions;

  // No deps, so a click reaches the current closure. No cleanup: one touching state
  // would fight the effect above it forever.
  useEffect(() => {
    setActions?.(actions);
  });

  // Handlers only: clearing the draw flags blinks the controls mid-switch.
  useEffect(
    () => () => {
      setActions?.({});
    },
    [setActions],
  );
}

/** `appMounted` is sticky, so a route that isn't the app has to say so itself. */
export function useSuppressQuickNavRail(): void {
  const host = useQuickNavHost();
  const setChromeless = host?.setChromeless;
  useEffect(() => {
    setChromeless?.(true);
    return () => setChromeless?.(false);
  }, [setChromeless]);
}
