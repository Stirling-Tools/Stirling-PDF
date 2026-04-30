// Default implementation for non-desktop environments (overridden in desktop)
export function useViewerKeyCommand(): (event: KeyboardEvent) => boolean {
  return () => false;
}
