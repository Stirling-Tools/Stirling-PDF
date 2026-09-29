import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { Icon } from "@app/ui/Icon";
import { getDesktopOs, DesktopOs } from "@app/services/platformService";
import styles from "@app/components/layout/TitleBarStrip.module.css";

// Seed the OS side from the UA so the correct reservation (macOS lights left /
// Windows controls right) is present on the first frame; getDesktopOs() confirms
// it authoritatively right after.
const seedOs: DesktopOs = /Windows/i.test(navigator.userAgent)
  ? DesktopOs.Windows
  : /Mac/i.test(navigator.userAgent)
    ? DesktopOs.Mac
    : DesktopOs.Unknown;

interface TitleBarStripProps {
  /** Strip centre: the WorkbenchBar's top-row slots and Super Search. Omitted on
   *  the pre-auth loading screen, which shows only the window controls. */
  children?: ReactNode;
}

/**
 * The desktop window's title-bar row. Full width, first in the viewport column,
 * so the rest of the app flows beneath it and can never overdraw the controls.
 * macOS keeps native traffic lights (drawn by the OS over the reserved left
 * gutter via the overlay title-bar style); Windows draws its own controls on
 * the right, since Tauri has no native-caption-plus-content mode there.
 */
export function TitleBarStrip({ children }: TitleBarStripProps) {
  const [os, setOs] = useState<DesktopOs>(seedOs);
  const [maximized, setMaximized] = useState(false);
  const isWindows = os === DesktopOs.Windows;

  useEffect(() => {
    let mounted = true;
    void getDesktopOs().then((v) => {
      if (mounted) setOs(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Keep the maximize/restore glyph in sync: double-click, snap, or the button
  // itself all change the window state.
  useEffect(() => {
    if (!isWindows || !isTauri()) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void appWindow.isMaximized().then(setMaximized);
    void appWindow
      .onResized(() => {
        void appWindow.isMaximized().then(setMaximized);
      })
      .then((u) => {
        unlisten = u;
      });
    return () => unlisten?.();
  }, [isWindows]);

  // Drag, and double-click-maximize, from any blank area of the strip. A
  // document-level hit test rather than data-tauri-drag-region because the strip
  // is full of interactive controls; startDragging() runs on the first move, not
  // mousedown (which would swallow the browser's dblclick). macOS needs this too:
  // the overlay title bar only lets the OS drag the native-lights region.
  useEffect(() => {
    if (!isTauri()) return;
    const DOUBLE_CLICK_MS = 500;
    const DRAG_THRESHOLD_PX = 4;
    const INTERACTIVE =
      "button, a[href], input, textarea, select, label, summary," +
      '[role="button"], [role="tab"], [role="menuitem"], [role="switch"],' +
      '[role="slider"], [contenteditable="true"], [data-no-window-drag]';
    const draggableAt = (e: MouseEvent) => {
      if (e.button !== 0) return false;
      const el = e.target as Element | null;
      if (!el || !el.closest("[data-title-bar-strip]")) return false;
      return !el.closest(INTERACTIVE);
    };
    let pending: { x: number; y: number } | null = null;
    let lastDownAt = 0;
    const onMouseDown = (e: MouseEvent) => {
      if (!draggableAt(e)) {
        pending = null;
        return;
      }
      const now = Date.now();
      if (now - lastDownAt < DOUBLE_CLICK_MS) {
        pending = null;
        lastDownAt = 0;
        void getCurrentWindow().toggleMaximize();
        return;
      }
      lastDownAt = now;
      pending = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!pending) return;
      if (
        Math.abs(e.clientX - pending.x) > DRAG_THRESHOLD_PX ||
        Math.abs(e.clientY - pending.y) > DRAG_THRESHOLD_PX
      ) {
        pending = null;
        lastDownAt = 0;
        void getCurrentWindow().startDragging();
      }
    };
    const onMouseUp = () => {
      pending = null;
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // getCurrentWindow() reads Tauri internals, so call it lazily in the handlers
  // rather than at render: this component also mounts in non-Tauri contexts
  // (the browser dev server), where a render-time call throws and, sitting above
  // any error boundary, would blank the whole app.
  return (
    <div className={styles.strip} data-title-bar-strip data-os={os}>
      {children}
      {isWindows && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.button}
            onClick={() => void getCurrentWindow().minimize()}
            aria-label="Minimize"
            tabIndex={-1}
          >
            <Icon name="minus" size="1em" />
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => void getCurrentWindow().toggleMaximize()}
            aria-label={maximized ? "Restore" : "Maximize"}
            tabIndex={-1}
          >
            {maximized ? (
              <Icon name="copy" size="1em" className={styles.restoreIcon} />
            ) : (
              <Icon name="square" size="1em" />
            )}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.close}`}
            onClick={() => void getCurrentWindow().close()}
            aria-label="Close"
            tabIndex={-1}
          >
            <Icon name="x" size="1em" />
          </button>
        </div>
      )}
    </div>
  );
}
