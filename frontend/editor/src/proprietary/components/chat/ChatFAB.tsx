import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createTheme, MantineProvider, Popover } from "@mantine/core";
import { Rnd } from "react-rnd";
import { useTranslation } from "react-i18next";
import { ChatFABButton } from "@shared/components/ChatFABButton";
import { ChatFABWindow } from "@shared/components/ChatFABWindow";
import { ChatPanel } from "@app/components/chat/ChatPanel";
import { useChat } from "@app/components/chat/ChatContext";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import { Z_INDEX_CHAT_FAB_OVERLAY } from "@app/styles/zIndex";
import "@app/components/chat/ChatFAB.css";

const PANEL_WIDTH_PX = 390;
const PANEL_HEIGHT_PX = 520;
const PANEL_MIN_WIDTH_PX = 300;
const PANEL_MIN_HEIGHT_PX = 380;
const FAB_GAP_PX = 16;
const FAB_BOTTOM_OFFSET_PX = FAB_GAP_PX;

const RESET_MS = 380;
const RESET_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const RESET_TRANSITION = `transform ${RESET_MS}ms ${RESET_EASING}, width ${RESET_MS}ms ${RESET_EASING}, height ${RESET_MS}ms ${RESET_EASING}`;

// Raise Mantine popup z-index so Menu/Popover portals appear above the FAB overlay.
const FAB_PANEL_THEME = createTheme({
  components: {
    Popover: Popover.extend({
      defaultProps: { zIndex: Z_INDEX_CHAT_FAB_OVERLAY + 300 },
    }),
  },
});

// Resize handle strips sit half-inside / half-outside the 1px border.
// zIndex: 1 ensures they appear above ChatFABWindow's stacking context
// (which is created by the CSS open/close transform), so the resize cursor
// is visible on hover — not just during active drag.
// Corners get a 14×14 zone; edges get a 6px-wide strip.
const RESIZE_HANDLES = {
  top: { top: -3, left: 14, right: 14, height: 6, zIndex: 1 },
  bottom: { bottom: -3, left: 14, right: 14, height: 6, zIndex: 1 },
  left: { left: -3, top: 14, bottom: 14, width: 6, zIndex: 1 },
  right: { right: -3, top: 14, bottom: 14, width: 6, zIndex: 1 },
  topLeft: { top: -4, left: -4, width: 14, height: 14, zIndex: 1 },
  topRight: { top: -4, right: -4, width: 14, height: 14, zIndex: 1 },
  bottomLeft: { bottom: -4, left: -4, width: 14, height: 14, zIndex: 1 },
  bottomRight: { bottom: -4, right: -4, width: 14, height: 14, zIndex: 1 },
};

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

  const getDefaultPos = () => {
    const el = overlayRef.current;
    if (!el) return null;
    return {
      x: el.offsetWidth - PANEL_WIDTH_PX - FAB_GAP_PX,
      y: el.offsetHeight - PANEL_HEIGHT_PX - FAB_BOTTOM_OFFSET_PX,
    };
  };

  useLayoutEffect(() => {
    // The overlay only mounts once the AI engine is enabled (config can load
    // after first render), so re-measure when that flips true rather than only
    // on initial mount, otherwise the default position never gets computed.
    if (!enabled) return;
    const pos = getDefaultPos();
    if (pos) setRndPos(pos);
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
          onDragStop={(_e, d) => setRndPos({ x: d.x, y: d.y })}
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
            <MantineProvider theme={FAB_PANEL_THEME}>
              <ChatPanel
                onBack={() => setIsOpen(false)}
                backLabel={t("chat.fab.close", "Close chat")}
              />
            </MantineProvider>
          </ChatFABWindow>
        </Rnd>
      )}
    </div>
  );
}
