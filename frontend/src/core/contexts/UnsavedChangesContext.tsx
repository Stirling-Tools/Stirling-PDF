import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Modal, Text, Button, Group, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface UnsavedChangesContextType {
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  /**
   * Call this before navigating away or closing.
   * Returns a promise that resolves to true if safe to proceed, false if blocked.
   */
  confirmIfDirty: () => Promise<boolean>;
  /**
   * Reset dirty state (call after successful save)
   */
  markClean: () => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType | undefined>(undefined);

interface UnsavedChangesProviderProps {
  children: ReactNode;
}

export function UnsavedChangesProvider({ children }: UnsavedChangesProviderProps) {
  const { t } = useTranslation();
  const [isDirty, setIsDirty] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const confirmIfDirty = useCallback((): Promise<boolean> => {
    if (!isDirty) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      setResolvePromise(() => resolve);
      setModalOpen(true);
    });
  }, [isDirty]);

  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

  const handleDiscard = () => {
    setModalOpen(false);
    setIsDirty(false);
    resolvePromise?.(true);
    setResolvePromise(null);
  };

  const handleCancel = () => {
    setModalOpen(false);
    resolvePromise?.(false);
    setResolvePromise(null);
  };

  return (
    <UnsavedChangesContext.Provider value={{ isDirty, setIsDirty, confirmIfDirty, markClean }}>
      {children}
      <Modal
        opened={modalOpen}
        onClose={handleCancel}
        title={t('admin.settings.unsavedChanges.title', 'Unsaved Changes')}
        centered
        size="sm"
        zIndex={1500}
      >
        <Stack gap="md">
          <Text size="sm">
            {t('admin.settings.unsavedChanges.message', 'You have unsaved changes. Do you want to discard them?')}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleCancel}>
              {t('admin.settings.unsavedChanges.cancel', 'Keep Editing')}
            </Button>
            <Button color="red" onClick={handleDiscard}>
              {t('admin.settings.unsavedChanges.discard', 'Discard Changes')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(): UnsavedChangesContextType {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider');
  }
  return context;
}

