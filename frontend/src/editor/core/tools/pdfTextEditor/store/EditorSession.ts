import type { ToolId } from "@editor/types/toolId";
import { useSyncExternalStore } from "react";
import type { DocumentChange } from "@editor/tools/pdfTextEditor/util/documentChanges";

export interface EditorSession {
  fileName: string | null;
  save: () => void;
  download: () => void;
  pickImage: () => void;
  /** Brings a page on screen, mounted or not. */
  revealPage: (pageIndex: number) => void;
  changeDocument: (change: DocumentChange) => Promise<void>;
  openTool: (tool: ToolId) => void;
  pageSize: (pageIndex: number) => { width: number; height: number } | null;
}

let current: EditorSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

export function setEditorSession(session: EditorSession | null): void {
  current = session;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): EditorSession | null {
  return current;
}

/** The session as it stands, for event handlers outside React's render. */
export function currentEditorSession(): EditorSession | null {
  return current;
}

export function useEditorSession(): EditorSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
