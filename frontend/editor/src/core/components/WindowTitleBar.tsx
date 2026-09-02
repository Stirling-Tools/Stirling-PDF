// Core stub: the browser build has no custom window chrome. The desktop layer
// shadows this (desktop/components/WindowTitleBar.tsx) with a real title bar on
// Windows. Rendered by AppFrame, so it must resolve in every build.
export function WindowTitleBar() {
  return null;
}
