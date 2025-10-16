import { useMemo } from 'react';
import { ActionIcon, Popover } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../shared/Tooltip';
import { useRightRailButtons, RightRailButtonWithAction } from '../../hooks/useRightRailButtons';
import LocalIcon from '../shared/LocalIcon';
import BulkSelectionPanel from './BulkSelectionPanel';

interface PageEditorRightRailButtonsParams {
  totalPages: number;
  selectedPageCount: number;
  csvInput: string;
  setCsvInput: (value: string) => void;
  selectedPageIds: string[];
  displayDocument?: { pages: { id: string; pageNumber: number }[] };
  updatePagesFromCSV: (override?: string) => void;
  handleSelectAll: () => void;
  handleDeselectAll: () => void;
  handleDelete: () => void;
  onExportSelected: () => void;
  exportLoading: boolean;
  activeFileCount: number;
  closePdf: () => void;
}

export function usePageEditorRightRailButtons(params: PageEditorRightRailButtonsParams) {
  const {
    totalPages,
    selectedPageCount,
    csvInput,
    setCsvInput,
    selectedPageIds,
    displayDocument,
    updatePagesFromCSV,
    handleSelectAll,
    handleDeselectAll,
    handleDelete,
    onExportSelected,
    exportLoading,
    activeFileCount,
    closePdf,
  } = params;

  const { t } = useTranslation();

  // Lift i18n labels out of memo for clarity
  const selectAllLabel = t('rightRail.selectAll', 'Select All');
  const deselectAllLabel = t('rightRail.deselectAll', 'Deselect All');
  const selectByNumberLabel = t('rightRail.selectByNumber', 'Select by Page Numbers');
  const deleteSelectedLabel = t('rightRail.deleteSelected', 'Delete Selected Pages');
  const exportSelectedLabel = t('rightRail.exportSelected', 'Export Selected Pages');
  const closePdfLabel = t('rightRail.closePdf', 'Close PDF');

  const buttons = useMemo<RightRailButtonWithAction[]>(() => {
    return [
      {
        id: 'page-select-all',
        icon: <LocalIcon icon="select-all" width="1.5rem" height="1.5rem" />,
        tooltip: selectAllLabel,
        ariaLabel: selectAllLabel,
        section: 'top' as const,
        order: 10,
        disabled: totalPages === 0 || selectedPageCount === totalPages,
        visible: totalPages > 0,
        onClick: handleSelectAll,
      },
      {
        id: 'page-deselect-all',
        icon: <LocalIcon icon="crop-square-outline" width="1.5rem" height="1.5rem" />,
        tooltip: deselectAllLabel,
        ariaLabel: deselectAllLabel,
        section: 'top' as const,
        order: 20,
        disabled: selectedPageCount === 0,
        visible: totalPages > 0,
        onClick: handleDeselectAll,
      },
      {
        id: 'page-select-by-number',
        tooltip: selectByNumberLabel,
        ariaLabel: selectByNumberLabel,
        section: 'top' as const,
        order: 30,
        disabled: totalPages === 0,
        visible: totalPages > 0,
        render: ({ disabled }) => (
          <Tooltip content={selectByNumberLabel} position="left" offset={12} arrow portalTarget={document.body}>
            <div className={`right-rail-fade enter`}>
              <Popover position="left" withArrow shadow="md" offset={8}>
                <Popover.Target>
                  <div style={{ display: 'inline-flex' }}>
                    <ActionIcon
                      variant="subtle"
                      radius="md"
                      className="right-rail-icon"
                      disabled={disabled || totalPages === 0}
                      aria-label={selectByNumberLabel}
                    >
                      <LocalIcon icon="pin-end" width="1.5rem" height="1.5rem" />
                    </ActionIcon>
                  </div>
                </Popover.Target>
                <Popover.Dropdown>
                  <div style={{ minWidth: '24rem', maxWidth: '32rem' }}>
                    <BulkSelectionPanel
                      csvInput={csvInput}
                      setCsvInput={setCsvInput}
                      selectedPageIds={selectedPageIds}
                      displayDocument={displayDocument}
                      onUpdatePagesFromCSV={updatePagesFromCSV}
                    />
                  </div>
                </Popover.Dropdown>
              </Popover>
            </div>
          </Tooltip>
        ),
      },
      {
        id: 'page-delete-selected',
        icon: <LocalIcon icon="delete-outline-rounded" width="1.5rem" height="1.5rem" />,
        tooltip: deleteSelectedLabel,
        ariaLabel: deleteSelectedLabel,
        section: 'top' as const,
        order: 40,
        disabled: selectedPageCount === 0,
        visible: totalPages > 0,
        onClick: handleDelete,
      },
      {
        id: 'page-export-selected',
        icon: <LocalIcon icon="download" width="1.5rem" height="1.5rem" />,
        tooltip: exportSelectedLabel,
        ariaLabel: exportSelectedLabel,
        section: 'top' as const,
        order: 50,
        disabled: selectedPageCount === 0 || exportLoading,
        visible: totalPages > 0,
        onClick: onExportSelected,
      },
      {
        id: 'page-close-pdf',
        icon: <LocalIcon icon="close-rounded" width="1.5rem" height="1.5rem" />,
        tooltip: closePdfLabel,
        ariaLabel: closePdfLabel,
        section: 'top' as const,
        order: 60,
        disabled: activeFileCount === 0,
        visible: activeFileCount > 0,
        onClick: closePdf,
      },
    ];
  }, [
    t,
    selectAllLabel,
    deselectAllLabel,
    selectByNumberLabel,
    deleteSelectedLabel,
    exportSelectedLabel,
    closePdfLabel,
    totalPages,
    selectedPageCount,
    csvInput,
    setCsvInput,
    selectedPageIds,
    displayDocument,
    updatePagesFromCSV,
    handleSelectAll,
    handleDeselectAll,
    handleDelete,
    onExportSelected,
    exportLoading,
    activeFileCount,
    closePdf,
  ]);

  useRightRailButtons(buttons);
}
