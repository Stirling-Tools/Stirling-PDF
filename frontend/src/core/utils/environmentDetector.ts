// Default implementation for non-desktop environments (overridden in desktop)
export function isDesktop(): boolean {
  return false;
}