import { useCallback, useEffect, useMemo, useState } from 'react';
import { signatureStorageService, type StorageType } from '@app/services/signatureStorageService';

export const MAX_SAVED_SIGNATURES = 10;

export type SavedSignatureType = 'canvas' | 'image' | 'text';
export type SignatureScope = 'personal' | 'shared' | 'localStorage';

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
      dataUrl: string;
      signerName: string;
      fontFamily: string;
      fontSize: number;
      textColor: string;
    };

export type SavedSignature = SavedSignaturePayload & {
  id: string;
  label: string;
  scope: SignatureScope;
  createdAt: number;
  updatedAt: number;
};

export type AddSignatureResult =
  | { success: true; signature: SavedSignature }
  | { success: false; reason: 'limit' | 'invalid' };

const isSupportedEnvironment = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

export const useSavedSignatures = () => {
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [storageType, setStorageType] = useState<StorageType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load signatures and detect storage type on mount
  useEffect(() => {
    const loadSignatures = async () => {
      try {
        const [signatures, type] = await Promise.all([
          signatureStorageService.loadSignatures(),
          signatureStorageService.getStorageType(),
        ]);
        setSavedSignatures(signatures);
        setStorageType(type);
      } catch (error) {
        console.error('[useSavedSignatures] Failed to load signatures:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSignatures();
  }, []);

  // Attempt migration from localStorage to backend when backend becomes available
  useEffect(() => {
    if (storageType === 'backend' && !isLoading) {
      signatureStorageService.migrateToBackend().then(result => {
        if (result.migrated > 0) {
          console.log(`[useSavedSignatures] Migrated ${result.migrated} signatures to backend`);
          // Reload after migration
          signatureStorageService.loadSignatures().then(setSavedSignatures);
        }
      });
    }
  }, [storageType, isLoading]);

  // Listen for storage events (for localStorage only)
  useEffect(() => {
    if (!isSupportedEnvironment() || storageType !== 'localStorage') {
      return;
    }

    const syncFromStorage = () => {
      signatureStorageService.loadSignatures().then(setSavedSignatures);
    };

    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, [storageType]);

  const isAtCapacity = savedSignatures.length >= MAX_SAVED_SIGNATURES;

  const addSignature = useCallback(
    async (payload: SavedSignaturePayload, label?: string, scope?: SignatureScope): Promise<AddSignatureResult> => {
      if (
        (payload.type === 'text' && !payload.signerName.trim()) ||
        ((payload.type === 'canvas' || payload.type === 'image') && !payload.dataUrl)
      ) {
        return { success: false, reason: 'invalid' };
      }

      if (savedSignatures.length >= MAX_SAVED_SIGNATURES) {
        return { success: false, reason: 'limit' };
      }

      const timestamp = Date.now();
      const newSignature: SavedSignature = {
        ...payload,
        id: generateId(),
        label: (label || 'Signature').trim() || 'Signature',
        scope: scope || (storageType === 'backend' ? 'personal' : 'localStorage'),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      try {
        await signatureStorageService.saveSignature(newSignature);
        setSavedSignatures(prev => [newSignature, ...prev]);
        return { success: true, signature: newSignature };
      } catch (error) {
        console.error('[useSavedSignatures] Failed to save signature:', error);
        return { success: false, reason: 'invalid' };
      }
    },
    [savedSignatures.length, storageType]
  );

  const removeSignature = useCallback(async (id: string) => {
    try {
      await signatureStorageService.deleteSignature(id);
      setSavedSignatures(prev => prev.filter(entry => entry.id !== id));
    } catch (error) {
      console.error('[useSavedSignatures] Failed to delete signature:', error);
    }
  }, []);

  const updateSignatureLabel = useCallback(async (id: string, nextLabel: string) => {
    try {
      await signatureStorageService.updateSignatureLabel(id, nextLabel);
      setSavedSignatures(prev =>
        prev.map(entry =>
          entry.id === id
            ? { ...entry, label: nextLabel.trim() || entry.label || 'Signature', updatedAt: Date.now() }
            : entry
        )
      );
    } catch (error) {
      console.error('[useSavedSignatures] Failed to update signature label:', error);
    }
  }, []);

  const replaceSignature = useCallback(
    async (id: string, payload: SavedSignaturePayload) => {
      const existing = savedSignatures.find(s => s.id === id);
      if (!existing) return;

      const updated: SavedSignature = {
        ...existing,
        ...payload,
        updatedAt: Date.now(),
      };

      try {
        await signatureStorageService.saveSignature(updated);
        setSavedSignatures(prev => prev.map(entry => (entry.id === id ? updated : entry)));
      } catch (error) {
        console.error('[useSavedSignatures] Failed to replace signature:', error);
      }
    },
    [savedSignatures]
  );

  const clearSignatures = useCallback(async () => {
    try {
      await Promise.all(savedSignatures.map(sig => signatureStorageService.deleteSignature(sig.id)));
      setSavedSignatures([]);
    } catch (error) {
      console.error('[useSavedSignatures] Failed to clear signatures:', error);
    }
  }, [savedSignatures]);

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
    storageType,
    isLoading,
  };
};

export type UseSavedSignaturesReturn = ReturnType<typeof useSavedSignatures>;
