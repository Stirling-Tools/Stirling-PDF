import { useSyncExternalStore } from "react";
import type { FileId } from "@app/types/file";

export interface EditorSession {
  fileName: string | null;
  fileId: FileId | null;
  save: () => void;
  download: () => void;
  pickFile: (file: File) => void;
  pickImage: () => void;
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

export function useEditorSession(): EditorSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
