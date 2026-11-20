import { useSyncExternalStore } from "react";
import type { SidebarProps } from "@editor/tools/pdfTextEditor/components/EditorSidebar";

/** What the inspector needs from the editor beyond its store, state and selection. */
export type InspectorActions = Omit<
  SidebarProps,
  "store" | "state" | "selection" | "initialTab"
>;

export interface EditorSession {
  fileName: string | null;
  save: () => void;
  download: () => void;
  pickImage: () => void;
  /** Brings a page on screen, mounted or not. */
  revealPage: (pageIndex: number) => void;
}

let current: EditorSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

export function setEditorSession(session: EditorSession): void {
  current = session;
  emit();
}

/**
 * Clears `session` if it is still the current one. An editor unmounting after
 * another has mounted (leaving the text editor for a review) must not clear the
 * newcomer's session.
 */
export function clearEditorSession(session: EditorSession): void {
  if (current !== session) return;
  current = null;
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

/**
 * Kept apart from the session: the actions change with the selection and OCR
 * state, and Properties must re-render on each change while the session holds.
 */
let inspector: InspectorActions | null = null;
const inspectorListeners = new Set<() => void>();

function emitInspector(): void {
  for (const listener of Array.from(inspectorListeners)) listener();
}

export function setEditorInspector(next: InspectorActions): void {
  inspector = next;
  emitInspector();
}

/** Clears `actions` if still current; see clearEditorSession. */
export function clearEditorInspector(actions: InspectorActions): void {
  if (inspector !== actions) return;
  inspector = null;
  emitInspector();
}

function subscribeInspector(listener: () => void): () => void {
  inspectorListeners.add(listener);
  return () => inspectorListeners.delete(listener);
}

function getInspector(): InspectorActions | null {
  return inspector;
}

export function useEditorInspector(): InspectorActions | null {
  return useSyncExternalStore(subscribeInspector, getInspector, getInspector);
}
