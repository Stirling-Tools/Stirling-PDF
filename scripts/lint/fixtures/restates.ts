export function useGrid() {
  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => event.active.id;

  // Selection state
  const selection = new Set<string>();

  // Debounced so a fast drag does not queue a layout pass per pointer move.
  const updateLayout = debounce(() => measure(), 16);

  return { handleDragStart, selection, updateLayout };
}

// ─── Types ────────────────────────────────────────────────────────────────

export type Gate = "OFFSITE_PROCESSING" | "AUTOMATION";

// Helpers

export function noop() {}
