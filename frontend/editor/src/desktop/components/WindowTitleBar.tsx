import { useEffect, useState } from "react";
import { useIsomorphicEffect } from "@mantine/hooks";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import MinimizeIcon from "@mui/icons-material/Minimize";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import FilterNoneIcon from "@mui/icons-material/FilterNone";
import CloseIcon from "@mui/icons-material/Close";
import { getDesktopOs, DesktopOs } from "@app/services/platformService";
import styles from "@app/components/WindowTitleBar.module.css";
// Desktop-only skin that reserves the controls' corner across core layout
// surfaces; every rule is gated by the data-window-controls flag set below.
import "@app/components/windowChrome.css";

// Seed from the UA so the bar (and its reserved height) is present on the first
// frame on Windows, avoiding a layout shift. getDesktopOs() confirms it right
// after via the Rust command.
const seedIsWindows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

/**
 * Custom window controls for the Windows desktop build. The native caption is
 * removed in Rust (decorations:false), so this draws minimize/maximize/close as
 * a fixed overlay pinned to the top-right corner — the rail and panels run all
 * the way to the window edge, and the app chrome reserves the corner via the
 * data-window-controls flag this sets on <html> (consumed by windowChrome.css).
 * Renders nothing on macOS/Linux (native decorations kept); not bundled in the
 * browser build. tao provides edge/corner resize for the undecorated window, so
 * no manual resize handles are needed here.
 */
export function WindowTitleBar() {
  const [isWindows, setIsWindows] = useState(seedIsWindows);
  const [maximized, setMaximized] = useState(false);
  const active = isWindows && isTauri();

  // Confirm the OS authoritatively (the UA seed is only a first-frame guess).
  useEffect(() => {
    if (!isTauri()) {
      setIsWindows(false);
      return;
    }
    let mounted = true;
    void getDesktopOs().then((os) => {
      if (mounted) setIsWindows(os === DesktopOs.Windows);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Flag the custom chrome on <html> so windowChrome.css can reserve the
  // controls' corner across the app. Set only when active (Windows desktop);
  // absent otherwise, so the skin is inert on macOS/Linux. Layout effect so it
  // lands before paint.
  useIsomorphicEffect(() => {
    const root = document.documentElement;
    if (active) {
      root.setAttribute("data-window-controls", "custom");
    } else {
      root.removeAttribute("data-window-controls");
    }
    return () => {
      root.removeAttribute("data-window-controls");
    };
  }, [active]);

  // Keep the maximize/restore icon in sync with the actual window state
  // (double-click, snap, or the button itself all change it).
  useEffect(() => {
    if (!active) return;
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
  }, [active]);

  // Let the window be dragged (and double-click-maximized) from any
  // non-interactive spot in the top strip. data-tauri-drag-region only fires
  // when the bare container is the click target, which leaves most of a busy
  // toolbar undraggable; a document-level hit test covers the whole top.
  useEffect(() => {
    if (!active) return;
    const TOP_STRIP_PX = 48;
    const INTERACTIVE =
      "button, a[href], input, textarea, select, label, summary," +
      '[role="button"], [role="tab"], [role="menuitem"], [role="switch"],' +
      '[role="slider"], [contenteditable="true"], [data-no-window-drag]';
    const draggableAt = (e: MouseEvent) => {
      if (e.button !== 0 || e.clientY > TOP_STRIP_PX) return false;
      const el = e.target as Element | null;
      return !!el && !el.closest(INTERACTIVE);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (draggableAt(e)) void getCurrentWindow().startDragging();
    };
    const onDoubleClick = (e: MouseEvent) => {
      if (draggableAt(e)) void getCurrentWindow().toggleMaximize();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("dblclick", onDoubleClick);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("dblclick", onDoubleClick);
    };
  }, [active]);

  if (!active) return null;

  const appWindow = getCurrentWindow();
  return (
    <div className={styles.titleBar}>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          onClick={() => void appWindow.minimize()}
          aria-label="Minimize"
          tabIndex={-1}
        >
          <MinimizeIcon fontSize="inherit" />
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => void appWindow.toggleMaximize()}
          aria-label={maximized ? "Restore" : "Maximize"}
          tabIndex={-1}
        >
          {maximized ? (
            <FilterNoneIcon fontSize="inherit" className={styles.restoreIcon} />
          ) : (
            <CropSquareIcon fontSize="inherit" />
          )}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.close}`}
          onClick={() => void appWindow.close()}
          aria-label="Close"
          tabIndex={-1}
        >
          <CloseIcon fontSize="inherit" />
        </button>
      </div>
    </div>
  );
}
