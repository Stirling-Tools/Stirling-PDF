import { useSyncExternalStore } from "react";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

export interface PageSetupRequest {
  document: EditorDocument;
  pageIndex: number;
  clientX: number;
  clientY: number;
}

let request: PageSetupRequest | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const pageSetupRequest = {
  open(next: PageSetupRequest): void {
    request = next;
    notify();
  },
  close(): void {
    if (!request) return;
    request = null;
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  for(document: EditorDocument | null): PageSetupRequest | null {
    return request && request.document === document ? request : null;
  },
};

export function usePageSetupRequest(
  document: EditorDocument | null,
): PageSetupRequest | null {
  return useSyncExternalStore(pageSetupRequest.subscribe, () =>
    pageSetupRequest.for(document),
  );
}
