import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createTheme,
  MantineProvider,
  Popover,
  useMantineColorScheme,
} from "@mantine/core";
import { Rnd } from "react-rnd";
import { useTranslation } from "react-i18next";
import { ChatFABButton } from "@shared/components/ChatFABButton";
import { ChatFABWindow } from "@shared/components/ChatFABWindow";
import { ChatPanel } from "@app/components/chat/ChatPanel";
import { useChat } from "@app/components/chat/ChatContext";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import { Z_INDEX_CHAT_FAB_OVERLAY } from "@app/styles/zIndex";
import {
  PANEL_WIDTH_PX,
  PANEL_HEIGHT_PX,
  PANEL_MIN_WIDTH_PX,
  PANEL_MIN_HEIGHT_PX,
  RESET_MS,
  RESET_TRANSITION,
  RESIZE_HANDLES,
  clampToOverlay,
  defaultPanelPos,
} from "@app/components/chat/chatFabLayout";
import "@app/components/chat/ChatFAB.css";

// Raise Mantine popup z-index so Menu/Popover portals appear above the FAB overlay.
const FAB_PANEL_THEME = createTheme({
  components: {
    Popover: Popover.extend({
      defaultProps: { zIndex: Z_INDEX_CHAT_FAB_OVERLAY + 300 },
    }),
  },
});

export function ChatFAB() {
  const { t } = useTranslation();
  // Intentionally separate from useChat().isOpen — the FAB tracks its own
  // open state so it doesn't interact with the right-rail chat panel.
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnviewedResult, setHasUnviewedResult] = useState(false);
  const { isLoading } = useChat();
  // Desktop sources this from the SaaS backend (cloud kill switch); web reads it
  // from the local app-config. Either way the AI engine drives FAB visibility.
  const enabled = useAiEngineEnabled();

  // Scope the panel's nested MantineProvider to this ref; unscoped it writes
  // its color scheme onto <html> and overrides the whole app's theme.
  const panelThemeRootRef = useRef<HTMLDivElement>(null);
  const { colorScheme } = useMantineColorScheme();
  const panelColorScheme = colorScheme === "dark" ? "dark" : "light";

  // Detect loading → done transition. If the FAB is closed when the agent
  // finishes, show the tick badge until the user opens the panel.
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  // Initialize to false, not isLoading: if loading is already in-flight at
  // mount we never showed the spinner, so we shouldn't show the tick on completion.
  const prevIsLoadingRef = useRef(false);
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;
    if (wasLoading && !isLoading && !isOpenRef.current) {
      setHasUnviewedResult(true);
    }
  }, [isLoading]);

  const overlayRef = useRef<HTMLDivElement>(null);
  const [rndPos, setRndPos] = useState<{ x: number; y: number } | null>(null);
  const [rndSize, setRndSize] = useState({
    width: PANEL_WIDTH_PX,
    height: PANEL_HEIGHT_PX,
  });
  const [isAnimatingReset, setIsAnimatingReset] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Anchored = at default home; re-homes on overlay resize. Drag/resize breaks anchor; double-click restores it.
  const [isAnchored, setIsAnchored] = useState(true);

  // Mirror the latest position/size/anchor into refs so the ResizeObserver below —
  // set up once — always reads current values without re-subscribing on every drag/resize.
  const rndPosRef = useRef(rndPos);
  rndPosRef.current = rndPos;
  const rndSizeRef = useRef(rndSize);
  rndSizeRef.current = rndSize;
  const isAnchoredRef = useRef(isAnchored);
  isAnchoredRef.current = isAnchored;

  const getDefaultPos = () => {
    const el = overlayRef.current;
    if (!el) return null;
    return defaultPanelPos(el.offsetWidth, el.offsetHeight);
  };

  useLayoutEffect(() => {
    // The overlay only mounts once the AI engine is enabled (config can load
    // after first render), so re-measure when that flips true rather than only
    // on initial mount, otherwise the default position never gets computed.
    if (!enabled) return;
    const pos = getDefaultPos();
    if (pos) setRndPos(pos);
  }, [enabled]);

  // bounds="parent" only clamps during active drag/resize; ResizeObserver keeps position valid when the overlay changes size.
  useEffect(() => {
    if (!enabled) return;
    const el = overlayRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const pos = rndPosRef.current;
      if (!pos) return;
      const base = isAnchoredRef.current
        ? defaultPanelPos(el.offsetWidth, el.offsetHeight)
        : pos;
      const next = clampToOverlay(
        base,
        rndSizeRef.current,
        el.offsetWidth,
        el.offsetHeight,
      );
      if (next.x !== pos.x || next.y !== pos.y) setRndPos(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  // Clear the reset timer on unmount to avoid state updates on dead components.
  // Also ensure body user-select is restored if we unmount mid-resize.
  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("-webkit-user-select");
    };
  }, []);

  const cancelResetAnimation = () => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setIsAnimatingReset(false);
  };

  const handleHeaderDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest(".chat-panel__header") && !target.closest("button")) {
      const pos = getDefaultPos();
      if (!pos) return;
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
      setIsAnimatingReset(true);
      setRndPos(pos);
      setRndSize({ width: PANEL_WIDTH_PX, height: PANEL_HEIGHT_PX });
      // Back at the default home — re-enable corner-hugging on resize.
      setIsAnchored(true);
      resetTimerRef.current = setTimeout(() => {
        setIsAnimatingReset(false);
        resetTimerRef.current = null;
      }, RESET_MS + 60);
    }
  };

  if (!enabled) return null;

  return (
    <div
      ref={overlayRef}
      className="chat-fab-overlay"
      style={{ zIndex: Z_INDEX_CHAT_FAB_OVERLAY }}
    >
      {/* Trigger button — fades out while panel is open */}
      <ChatFABButton
        className={`chat-fab-trigger${isOpen ? " chat-fab-trigger--hidden" : ""}`}
        onClick={() => {
          // Fallback: ensure a position exists before opening, in case the
          // layout effect measured before the overlay was laid out.
          if (rndPos === null) {
            const pos = getDefaultPos();
            if (pos) setRndPos(pos);
          }
          setIsOpen(true);
          setHasUnviewedResult(false);
        }}
        aria-label={t("chat.fab.open", "Open Stirling AI assistant")}
        aria-expanded={isOpen}
        isLoading={isLoading}
        showTick={hasUnviewedResult && !isLoading}
      />

      {/* Draggable / resizable panel */}
      {rndPos !== null && (
        <Rnd
          className="chat-fab-panel-rnd"
          position={rndPos}
          size={rndSize}
          minWidth={PANEL_MIN_WIDTH_PX}
          minHeight={PANEL_MIN_HEIGHT_PX}
          bounds="parent"
          enableResizing={true}
          // Drag from the header; cancel keeps buttons inside it clickable
          dragHandleClassName="chat-panel__header"
          cancel="button, [role='button']"
          onDragStart={cancelResetAnimation}
          onDragStop={(_e, d) => {
            setRndPos({ x: d.x, y: d.y });
            // A bare click on the header fires drag start/stop without movement;
            // only break the anchor when the panel actually moved.
            if (rndPos && (d.x !== rndPos.x || d.y !== rndPos.y)) {
              setIsAnchored(false);
            }
          }}
          onResizeStart={() => {
            cancelResetAnimation();
            document.body.style.setProperty("user-select", "none");
            document.body.style.setProperty("-webkit-user-select", "none");
          }}
          onResizeStop={(_e, _dir, ref, _delta, pos) => {
            document.body.style.removeProperty("user-select");
            document.body.style.removeProperty("-webkit-user-select");
            setRndSize({ width: ref.offsetWidth, height: ref.offsetHeight });
            setRndPos(pos);
            setIsAnchored(false);
          }}
          // Invisible strips centred on the border — cursor change is the affordance.
          // zIndex: 1 lifts them above ChatFABWindow's stacking context.
          resizeHandleStyles={RESIZE_HANDLES}
          style={{
            pointerEvents: isOpen ? "auto" : "none",
            transition: isAnimatingReset ? RESET_TRANSITION : undefined,
          }}
        >
          <ChatFABWindow open={isOpen} onDoubleClick={handleHeaderDoubleClick}>
            <MantineProvider
              theme={FAB_PANEL_THEME}
              getRootElement={() => panelThemeRootRef.current ?? undefined}
              forceColorScheme={panelColorScheme}
            >
              <div ref={panelThemeRootRef} style={{ display: "contents" }}>
                <ChatPanel
                  onBack={() => setIsOpen(false)}
                  backLabel={t("chat.fab.close", "Close chat")}
                />
              </div>
            </MantineProvider>
          </ChatFABWindow>
        </Rnd>
      )}
    </div>
  );
}
