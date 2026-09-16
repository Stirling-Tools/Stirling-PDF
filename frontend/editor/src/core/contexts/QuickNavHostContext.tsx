import type { ToolId } from "@app/types/toolId";
import {
  EMPTY_QUICK_NAV_ACCOUNT,
  updateQuickNavAccount,
  type QuickNavAccount,
  type QuickNavAccountUpdate,
} from "@app/contexts/quickNavAccount";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type QuickNavToolReasons = Partial<Record<ToolId, string>>;

export type { QuickNavIdentity } from "@app/contexts/quickNavAccount";

export interface QuickNavViewData {
  readerMode: boolean;
  /** The library is a view of the editor app, and the rail marks it as its own place. */
  fileLibrary: boolean;
  activeTool: ToolId | null;
  /** The app owns the panel; the rail's bell only reports its state. */
  notificationsOpen: boolean;
  /** Translated; absent means usable. */
  toolReasons: QuickNavToolReasons;
  /** Mirrors `openFromComputer`, which lives in a ref and so cannot trigger a render. */
  hasOpenFromComputer: boolean;
}

export interface QuickNavHostActions {
  /** The editor reads its tool from the URL only on mount. */
  selectTool?: (toolId: ToolId) => void;
  setReaderMode?: (on: boolean) => void;
  showFileLibrary?: () => void;
  createProcessingFolder?: () => void;
  toggleNotifications?: () => void;
  goToDefaultState?: () => void;
  requestNavigation?: (go: () => void) => void;
  openFromComputer?: () => void;
  /**
   * Absent unless the app says the hidden novelty features are enabled, which
   * is the only gate the rail gets - see useBrandFlourish. `originRect` is the
   * clicked control, for whatever flies out of it.
   */
  onBrandFlourish?: (originRect: DOMRect | null) => void;
}

interface QuickNavHostValue extends QuickNavAccount, QuickNavViewData {
  /** Sticky: one view unmounts before the next one registers. */
  appMounted: boolean;
  /** Screens without app chrome suppress the rail only while mounted. */
  chromeless: boolean;
  setChromeless: (chromeless: boolean) => void;
  /** A ref, so a click reaches the app currently mounted. */
  actions: React.RefObject<QuickNavHostActions>;
  updateAccount: (update: QuickNavAccountUpdate) => void;
  setViewData: (data: Partial<QuickNavViewData>) => void;
  setActions: (actions: QuickNavHostActions) => void;
}

const EMPTY_REASONS: QuickNavToolReasons = {};

const EMPTY_VIEW: QuickNavViewData = {
  toolReasons: EMPTY_REASONS,
  readerMode: false,
  fileLibrary: false,
  activeTool: null,
  notificationsOpen: false,
  hasOpenFromComputer: false,
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
  const [account, updateAccount] = useReducer(
    updateQuickNavAccount,
    EMPTY_QUICK_NAV_ACCOUNT,
  );
  const [view, setViewState] = useState({ ...EMPTY_VIEW, appMounted: false });
  const [chromeless, setChromelessState] = useState(false);
  const actions = useRef<QuickNavHostActions>({});

  const setViewData = useCallback((next: Partial<QuickNavViewData>) => {
    setViewState((prev) => {
      const merged = {
        appMounted: true,
        readerMode: next.readerMode ?? false,
        fileLibrary: next.fileLibrary ?? false,
        activeTool: next.activeTool ?? null,
        notificationsOpen: next.notificationsOpen ?? false,
        toolReasons: next.toolReasons ?? prev.toolReasons,
        hasOpenFromComputer: next.hasOpenFromComputer ?? false,
      };
      const unchanged =
        merged.appMounted === prev.appMounted &&
        merged.readerMode === prev.readerMode &&
        merged.fileLibrary === prev.fileLibrary &&
        merged.activeTool === prev.activeTool &&
        merged.notificationsOpen === prev.notificationsOpen &&
        merged.hasOpenFromComputer === prev.hasOpenFromComputer &&
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
      ...account,
      ...view,
      chromeless,
      actions,
      updateAccount,
      setViewData,
      setActions,
      setChromeless,
    }),
    [
      account,
      view,
      chromeless,
      updateAccount,
      setViewData,
      setActions,
      setChromeless,
    ],
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

/** Registers the mounted view's controls; handlers are released on unmount. No-ops without a host. */
export function useRegisterQuickNavView(
  data: Partial<QuickNavViewData>,
  actions: QuickNavHostActions,
): void {
  const host = useQuickNavHost();
  const setViewData = host?.setViewData;
  const {
    readerMode,
    fileLibrary,
    activeTool,
    notificationsOpen,
    toolReasons,
  } = data;
  const hasOpenFromComputer = Boolean(actions.openFromComputer);
  useEffect(() => {
    setViewData?.({
      readerMode,
      fileLibrary,
      activeTool,
      notificationsOpen,
      toolReasons,
      hasOpenFromComputer,
    });
  }, [
    setViewData,
    readerMode,
    fileLibrary,
    activeTool,
    notificationsOpen,
    toolReasons,
    hasOpenFromComputer,
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
