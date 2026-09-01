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
  /** Sticky: one app unmounts before the next one registers. */
  appMounted: boolean;
  identity: QuickNavIdentity | null;
  signingBadge: number;
  portalAccess: boolean;
  readerMode: boolean;
  activeTool: ToolId | null;
  /** The app owns the panel; the rail's bell only reports its state. */
  notificationsOpen: boolean;
  /** Translated; absent means usable. */
  toolReasons: QuickNavToolReasons;
  /** Mirrors `openSettings`, which lives in a ref and so cannot trigger a render. */
  hasSettings: boolean;
}

export interface QuickNavHostActions {
  openSettings?: () => void;
  /** The editor reads its tool from the URL only on mount. */
  selectTool?: (toolId: ToolId) => void;
  setReaderMode?: (on: boolean) => void;
  toggleNotifications?: () => void;
  goToDefaultState?: () => void;
  requestNavigation?: (go: () => void) => void;
}

interface QuickNavHostValue extends QuickNavHostData {
  /** Reset on unmount, unlike the data above. */
  chromeless: boolean;
  setChromeless: (chromeless: boolean) => void;
  /** A ref, so a click reaches the app currently mounted. */
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
  activeTool: null,
  notificationsOpen: false,
  hasSettings: false,
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

/** Outside both apps' providers, so each app registers what only it knows. */
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
        merged.activeTool === prev.activeTool &&
        merged.notificationsOpen === prev.notificationsOpen &&
        merged.hasSettings === prev.hasSettings &&
        merged.identity?.displayName === prev.identity?.displayName &&
        merged.identity?.profilePictureUrl ===
          prev.identity?.profilePictureUrl &&
        // Compared by value: the object is rebuilt every render.
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
    activeTool,
    notificationsOpen,
    toolReasons,
  } = data;
  const hasSettings = Boolean(actions.openSettings);

  useEffect(() => {
    host?.setData({
      appMounted: true,
      identity: identity ?? null,
      signingBadge: signingBadge ?? 0,
      portalAccess: portalAccess ?? false,
      readerMode: readerMode ?? false,
      // Cleared, not omitted as toolReasons is: a stale tool marks an entry.
      activeTool: activeTool ?? null,
      notificationsOpen: notificationsOpen ?? false,
      // Omitted when unknown, so the last answer survives a re-fetch.
      ...(toolReasons ? { toolReasons } : {}),
      hasSettings,
    });
    // By field: identity is rebuilt every render.
  }, [
    host,
    identity?.displayName,
    identity?.profilePictureUrl,
    signingBadge,
    portalAccess,
    readerMode,
    activeTool,
    notificationsOpen,
    toolReasons,
    hasSettings,
  ]);

  const setActions = host?.setActions;

  // No deps: a click has to reach the current closure.
  useEffect(() => {
    setActions?.(actions);
  });

  // Handlers only: clearing the data too would blink the controls mid-switch.
  useEffect(
    () => () => {
      setActions?.({});
    },
    [setActions],
  );
}

/** `appMounted` is sticky, so a screen that isn't the app has to say so itself. */
export function useSuppressQuickNavRail(active = true): void {
  const host = useQuickNavHost();
  const setChromeless = host?.setChromeless;
  useEffect(() => {
    if (!active) return;
    setChromeless?.(true);
    return () => setChromeless?.(false);
  }, [active, setChromeless]);
}
