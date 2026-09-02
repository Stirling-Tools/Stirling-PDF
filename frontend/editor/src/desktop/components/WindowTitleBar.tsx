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

// Seed from the UA so the bar (and its reserved height) is present on the first
// frame on Windows, avoiding a layout shift. getDesktopOs() confirms it right
// after via the Rust command.
const seedIsWindows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

/**
 * Custom in-app window title bar for the Windows desktop build. The native
 * caption is removed in Rust (decorations:false), so this draws the themed drag
 * region + minimize/maximize/close controls in its place, letting the app chrome
 * run edge to edge. Renders nothing on macOS/Linux (native decorations kept) and
 * in the browser build (core stub). tao provides edge/corner resize for the
 * undecorated window, so no manual resize handles are needed here.
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

  // Reserve the bar's height for the rest of the app. AppLayout sizes itself as
  // calc(100dvh - var(--titlebar-h)); everywhere else the var is unset (0).
  // Layout effect so it lands before paint and nothing overflows for a frame.
  useIsomorphicEffect(() => {
    const root = document.documentElement;
    if (active) {
      root.style.setProperty("--titlebar-h", "2rem");
    } else {
      root.style.removeProperty("--titlebar-h");
    }
    return () => {
      root.style.removeProperty("--titlebar-h");
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

  if (!active) return null;

  const appWindow = getCurrentWindow();
  return (
    <div className={styles.titleBar} data-tauri-drag-region>
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
