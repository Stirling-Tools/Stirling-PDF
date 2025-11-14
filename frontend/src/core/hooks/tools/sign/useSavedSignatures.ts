import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'stirling:saved-signatures:v1';
export const MAX_SAVED_SIGNATURES = 10;

export type SavedSignatureType = 'canvas' | 'image' | 'text';

export type SavedSignaturePayload =
  | {
      type: 'canvas';
      dataUrl: string;
    }
  | {
      type: 'image';
      dataUrl: string;
    }
  | {
      type: 'text';
      signerName: string;
      fontFamily: string;
      fontSize: number;
      textColor: string;
    };

export type SavedSignature = SavedSignaturePayload & {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
};

export type AddSignatureResult =
  | { success: true; signature: SavedSignature }
  | { success: false; reason: 'limit' | 'invalid' };

const isSupportedEnvironment = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safeParse = (raw: string | null): SavedSignature[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry: any): entry is SavedSignature => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      if (typeof entry.id !== 'string' || typeof entry.label !== 'string') {
        return false;
      }
      if (typeof entry.type !== 'string') {
        return false;
      }

      if (entry.type === 'text') {
        return (
          typeof entry.signerName === 'string' &&
          typeof entry.fontFamily === 'string' &&
          typeof entry.fontSize === 'number' &&
          typeof entry.textColor === 'string'
        );
      }

      return typeof entry.dataUrl === 'string';
    });
  } catch {
    return [];
  }
};

const readFromStorage = (): SavedSignature[] => {
  if (!isSupportedEnvironment()) {
    return [];
  }

  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
};

const writeToStorage = (entries: SavedSignature[]) => {
  if (!isSupportedEnvironment()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Swallow storage errors silently; we still keep state in memory.
  }
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

export const useSavedSignatures = () => {
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>(() => readFromStorage());

  useEffect(() => {
    if (!isSupportedEnvironment()) {
      return;
    }

    const syncFromStorage = () => {
      setSavedSignatures(readFromStorage());
    };

    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  useEffect(() => {
    writeToStorage(savedSignatures);
  }, [savedSignatures]);

  const isAtCapacity = savedSignatures.length >= MAX_SAVED_SIGNATURES;

  const addSignature = useCallback(
    (payload: SavedSignaturePayload, label?: string): AddSignatureResult => {
      if (
        (payload.type === 'text' && !payload.signerName.trim()) ||
        ((payload.type === 'canvas' || payload.type === 'image') && !payload.dataUrl)
      ) {
        return { success: false, reason: 'invalid' };
      }

      let createdSignature: SavedSignature | null = null;
      setSavedSignatures(prev => {
        if (prev.length >= MAX_SAVED_SIGNATURES) {
          return prev;
        }

        const timestamp = Date.now();
        const nextEntry: SavedSignature = {
          ...payload,
          id: generateId(),
          label: (label || 'Signature').trim() || 'Signature',
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        createdSignature = nextEntry;
        return [nextEntry, ...prev];
      });

      return createdSignature
        ? { success: true, signature: createdSignature }
        : { success: false, reason: 'limit' };
    },
    []
  );

  const removeSignature = useCallback((id: string) => {
    setSavedSignatures(prev => prev.filter(entry => entry.id !== id));
  }, []);

  const updateSignatureLabel = useCallback((id: string, nextLabel: string) => {
    setSavedSignatures(prev =>
      prev.map(entry =>
        entry.id === id
          ? { ...entry, label: nextLabel.trim() || entry.label || 'Signature', updatedAt: Date.now() }
          : entry
      )
    );
  }, []);

  const replaceSignature = useCallback((id: string, payload: SavedSignaturePayload) => {
    setSavedSignatures(prev =>
      prev.map(entry =>
        entry.id === id
          ? {
              ...entry,
              ...payload,
              updatedAt: Date.now(),
            }
          : entry
      )
    );
  }, []);

  const clearSignatures = useCallback(() => {
    setSavedSignatures([]);
  }, []);

  const byTypeCounts = useMemo(() => {
    return savedSignatures.reduce<Record<SavedSignatureType, number>>(
      (acc, entry) => {
        acc[entry.type] += 1;
        return acc;
      },
      { canvas: 0, image: 0, text: 0 }
    );
  }, [savedSignatures]);

  return {
    savedSignatures,
    isAtCapacity,
    addSignature,
    removeSignature,
    updateSignatureLabel,
    replaceSignature,
    clearSignatures,
    byTypeCounts,
  };
};

export type UseSavedSignaturesReturn = ReturnType<typeof useSavedSignatures>;
