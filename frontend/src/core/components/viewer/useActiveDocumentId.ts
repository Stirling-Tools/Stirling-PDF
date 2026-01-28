import { useActiveDocument } from '@app/components/viewer/ActiveDocumentContext';

/**
 * Hook to get the currently active document ID.
 * Uses a shared context to avoid multiple subscriptions.
 */
export function useActiveDocumentId(): string | null {
  return useActiveDocument();
}
