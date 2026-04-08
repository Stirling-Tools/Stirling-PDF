/**
 * State machine hook for document import flow.
 * Handles: file drop → text extraction → AI analysis → review → commit to profile store.
 */
import { useState, useCallback } from 'react';
import { extractFullText } from './pdfTextExtraction';
import { extractFromDocuments } from './aiFormFillApi';
import type { KnowledgeEntry } from './types';
import type { KnowledgeStore } from './useKnowledgeStore';

export type ImportState = 'idle' | 'extracting_text' | 'calling_ai' | 'reviewing' | 'error';

export interface ReviewableEntry {
  key: string;
  value: string;
  source: string;
  accepted: boolean;
}

export interface ReviewableProfile {
  name: string;
  accepted: boolean;
  entries: ReviewableEntry[];
  sourceDocuments: string[];
}

export interface DocumentImport {
  state: ImportState;
  extractionProgress: { completed: number; total: number };
  proposedProfiles: ReviewableProfile[];
  error: string | null;

  startImport: (files: File[], existingEntityNames?: string[]) => void;
  toggleEntry: (profileIndex: number, entryIndex: number) => void;
  editEntryValue: (profileIndex: number, entryIndex: number, newValue: string) => void;
  setProfileName: (profileIndex: number, name: string) => void;
  toggleProfile: (profileIndex: number) => void;
  acceptAndCommit: (knowledge: KnowledgeStore) => void;
  reset: () => void;
}

function entriesToReviewable(entries: KnowledgeEntry[]): ReviewableEntry[] {
  return entries.map((e) => ({
    key: e.key,
    value: e.value,
    source: e.source,
    accepted: true,
  }));
}

export function useDocumentImport(): DocumentImport {
  const [state, setState] = useState<ImportState>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [profiles, setProfiles] = useState<ReviewableProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const startImport = useCallback(async (files: File[], existingEntityNames: string[] = []) => {
    setState('extracting_text');
    setError(null);
    setProgress({ completed: 0, total: files.length });

    try {
      // Extract text from each file
      const documents: { fileName: string; text: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await extractFullText(file);
        documents.push({ fileName: file.name, text });
        setProgress({ completed: i + 1, total: files.length });
      }

      // Call AI engine
      setState('calling_ai');
      const response = await extractFromDocuments({
        documents,
        existingProfileNames: existingEntityNames,
      });

      console.log('[Document Import] Response:', JSON.stringify(response, null, 2));

      if (response.outcome === 'multi_profile_extraction') {
        setProfiles(
          response.proposedProfiles.map((p) => ({
            name: p.suggestedName,
            accepted: true,
            entries: entriesToReviewable(p.entries),
            sourceDocuments: p.sourceDocuments,
          }))
        );
      } else if (response.outcome === 'knowledge_update') {
        // Single profile — use first file name as hint
        const name = documents.length === 1 ? documents[0].fileName.replace(/\.[^.]+$/, '') : 'Imported';
        setProfiles([
          {
            name,
            accepted: true,
            entries: entriesToReviewable(response.proposedEntries),
            sourceDocuments: documents.map((d) => d.fileName),
          },
        ]);
      }

      setState('reviewing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
      setState('error');
    }
  }, []);

  const toggleEntry = useCallback((profileIndex: number, entryIndex: number) => {
    setProfiles((prev) =>
      prev.map((p, pi) =>
        pi === profileIndex
          ? { ...p, entries: p.entries.map((e, ei) => (ei === entryIndex ? { ...e, accepted: !e.accepted } : e)) }
          : p
      )
    );
  }, []);

  const editEntryValue = useCallback((profileIndex: number, entryIndex: number, newValue: string) => {
    setProfiles((prev) =>
      prev.map((p, pi) =>
        pi === profileIndex
          ? { ...p, entries: p.entries.map((e, ei) => (ei === entryIndex ? { ...e, value: newValue } : e)) }
          : p
      )
    );
  }, []);

  const setProfileName = useCallback((profileIndex: number, name: string) => {
    setProfiles((prev) => prev.map((p, pi) => (pi === profileIndex ? { ...p, name } : p)));
  }, []);

  const toggleProfile = useCallback((profileIndex: number) => {
    setProfiles((prev) => prev.map((p, pi) => (pi === profileIndex ? { ...p, accepted: !p.accepted } : p)));
  }, []);

  const acceptAndCommit = useCallback(
    (knowledge: KnowledgeStore) => {
      const store = knowledge.entityStore;
      for (const profile of profiles) {
        if (!profile.accepted) continue;
        const acceptedEntries: Record<string, string> = {};
        for (const entry of profile.entries) {
          if (entry.accepted) {
            acceptedEntries[entry.key] = entry.value;
          }
        }
        if (Object.keys(acceptedEntries).length === 0) continue;

        // Find existing entity by name, or create new one as 'person' type
        const existing = store.entities.find((e) => e.name === profile.name);
        if (existing) {
          store.setManyFields(existing.id, acceptedEntries);
        } else {
          const entity = store.createEntity('person', profile.name);
          store.setManyFields(entity.id, acceptedEntries);
        }
      }
      setProfiles([]);
      setState('idle');
    },
    [profiles]
  );

  const reset = useCallback(() => {
    setState('idle');
    setProfiles([]);
    setError(null);
    setProgress({ completed: 0, total: 0 });
  }, []);

  return {
    state,
    extractionProgress: progress,
    proposedProfiles: profiles,
    error,
    startImport,
    toggleEntry,
    editEntryValue,
    setProfileName,
    toggleProfile,
    acceptAndCommit,
    reset,
  };
}
