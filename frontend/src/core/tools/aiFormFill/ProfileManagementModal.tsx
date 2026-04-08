/**
 * Entity Management Modal — manage typed entities and import documents.
 */
import { useState } from 'react';
import { Modal, SegmentedControl, Stack } from '@mantine/core';
import { EntitiesTab } from './EntitiesTab';
import { ImportTab } from './ImportTab';
import { useDocumentImport } from './useDocumentImport';
import type { KnowledgeStore } from './useKnowledgeStore';

interface ProfileManagementModalProps {
  opened: boolean;
  onClose: () => void;
  knowledge: KnowledgeStore;
}

export function ProfileManagementModal({ opened, onClose, knowledge }: ProfileManagementModalProps) {
  const [activeTab, setActiveTab] = useState<string>('entities');
  const documentImport = useDocumentImport();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Entity Management"
      size="lg"
      centered
    >
      <Stack gap="md">
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          data={[
            { label: 'Entities', value: 'entities' },
            { label: 'Import Documents', value: 'import' },
          ]}
          fullWidth
        />

        {activeTab === 'entities' ? (
          <EntitiesTab store={knowledge.entityStore} />
        ) : (
          <ImportTab documentImport={documentImport} knowledge={knowledge} />
        )}
      </Stack>
    </Modal>
  );
}
