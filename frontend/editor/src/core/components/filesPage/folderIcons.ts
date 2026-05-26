/**
 * Folder icon presets. Each is a single emoji that overlays the folder
 * thumbnail. Picked to cover the most common organisational uses of a
 * folder without resorting to a custom icon system.
 *
 * Kept small (≤24) so the picker is one glanceable row in the menu.
 */

export interface FolderIconOption {
  id: string;
  glyph: string;
  label: string;
}

export const FOLDER_ICONS: FolderIconOption[] = [
  { id: "none", glyph: "", label: "No icon" },
  { id: "star", glyph: "★", label: "Star" },
  { id: "heart", glyph: "♥", label: "Heart" },
  { id: "work", glyph: "💼", label: "Work" },
  { id: "home", glyph: "🏠", label: "Home" },
  { id: "tax", glyph: "💰", label: "Money" },
  { id: "receipt", glyph: "🧾", label: "Receipt" },
  { id: "contract", glyph: "📝", label: "Contract" },
  { id: "id", glyph: "🪪", label: "ID" },
  { id: "house", glyph: "🏡", label: "House" },
  { id: "travel", glyph: "✈️", label: "Travel" },
  { id: "photos", glyph: "🖼️", label: "Photos" },
  { id: "music", glyph: "🎵", label: "Music" },
  { id: "code", glyph: "💻", label: "Code" },
  { id: "health", glyph: "🏥", label: "Health" },
  { id: "school", glyph: "🎓", label: "School" },
  { id: "warning", glyph: "⚠️", label: "Warning" },
  { id: "archive", glyph: "📦", label: "Archive" },
];

export function findFolderIcon(
  id: string | undefined,
): FolderIconOption | null {
  if (!id) return null;
  return FOLDER_ICONS.find((i) => i.id === id) ?? null;
}
