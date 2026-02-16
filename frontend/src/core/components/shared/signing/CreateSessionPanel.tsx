import { useTranslation } from 'react-i18next';
import { Text, Switch } from '@mantine/core';
import UserSelector from '@app/components/shared/UserSelector';
import type { FileState } from '@app/types/file';

interface CreateSessionPanelProps {
  selectedFiles: FileState[];
  selectedUserIds: number[];
  onSelectedUserIdsChange: (userIds: number[]) => void;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  creating: boolean;
  includeSummaryPage: boolean;
  onIncludeSummaryPageChange: (value: boolean) => void;
}

const CreateSessionPanel = ({
  selectedFiles,
  selectedUserIds,
  onSelectedUserIdsChange,
  dueDate,
  onDueDateChange,
  creating,
  includeSummaryPage,
  onIncludeSummaryPageChange,
}: CreateSessionPanelProps) => {
  const { t } = useTranslation();

  const hasValidFile = selectedFiles.length === 1;

  return (
    <div className="quick-access-popout__panel">
      {!hasValidFile ? (
        <div className="quick-access-popout__section">
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {t('quickAccess.selectSingleFileToRequest', 'Select a single PDF file to request signatures')}
          </Text>
        </div>
      ) : (
        <>
          <div className="quick-access-popout__section">
            <div className="quick-access-popout__label">{t('quickAccess.selectedFile', 'Selected file')}</div>
            <div className="quick-access-popout__row-title">
              {selectedFiles[0]?.name || t('quickAccess.noFile', 'No file selected')}
            </div>
          </div>

          <div className="quick-access-popout__section">
            <div className="quick-access-popout__label">{t('quickAccess.selectUsers', 'Select users to sign')}</div>
            <UserSelector
              value={selectedUserIds}
              onChange={onSelectedUserIdsChange}
              size="xs"
              placeholder={t('quickAccess.selectUsersPlaceholder', 'Choose participants...')}
              disabled={creating}
            />
          </div>

          <div className="quick-access-popout__section">
            <div className="quick-access-popout__label">{t('quickAccess.dueDate', 'Due date (optional)')}</div>
            <input
              type="date"
              className="quick-access-popout__input"
              value={dueDate}
              onChange={(e) => onDueDateChange(e.target.value)}
              disabled={creating}
            />
          </div>

          <div className="quick-access-popout__section">
            <Switch
              label={t('certSign.collab.sessionCreation.includeSummaryPage', 'Include Signature Summary Page')}
              description={t('certSign.collab.sessionCreation.includeSummaryPageHelp', 'Add a summary page at the end with all signature details')}
              checked={includeSummaryPage}
              onChange={(e) => onIncludeSummaryPageChange(e.currentTarget.checked)}
              disabled={creating}
              size="sm"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default CreateSessionPanel;
