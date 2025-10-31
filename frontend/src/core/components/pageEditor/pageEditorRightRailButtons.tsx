import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRightRailButtons, RightRailButtonWithAction } from '@app/hooks/useRightRailButtons';
import LocalIcon from '@app/components/shared/LocalIcon';
import PageSelectByNumberButton from '@app/components/pageEditor/PageSelectByNumberButton';

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
  onSaveChanges: () => void;
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
    onSaveChanges,
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
  const saveChangesLabel = t('rightRail.saveChanges', 'Save Changes');
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
          <PageSelectByNumberButton
            disabled={disabled}
            totalPages={totalPages}
            label={selectByNumberLabel}
            csvInput={csvInput}
            setCsvInput={setCsvInput}
            selectedPageIds={selectedPageIds}
            displayDocument={displayDocument}
            updatePagesFromCSV={updatePagesFromCSV}
          />
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
        id: 'page-save-changes',
        icon: <LocalIcon icon="save" width="1.5rem" height="1.5rem" />,
        tooltip: saveChangesLabel,
        ariaLabel: saveChangesLabel,
        section: 'top' as const,
        order: 55,
        disabled: totalPages === 0 || exportLoading,
        visible: totalPages > 0,
        onClick: onSaveChanges,
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
    saveChangesLabel,
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
    onSaveChanges,
    exportLoading,
    activeFileCount,
    closePdf,
  ]);

  useRightRailButtons(buttons);
}
