import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useWorkbenchBarButtons,
  WorkbenchBarButtonWithAction,
} from "@app/hooks/useWorkbenchBarButtons";
import PageSelectByNumberButton from "@app/components/pageEditor/PageSelectByNumberButton";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadIcon from "@mui/icons-material/Download";
import SaveIcon from "@mui/icons-material/Save";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import CropSquareIcon from "@mui/icons-material/CropSquare";

interface PageEditorWorkbenchBarButtonsParams {
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
}

export function usePageEditorWorkbenchBarButtons(
  params: PageEditorWorkbenchBarButtonsParams,
) {
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
  } = params;

  const { t, i18n } = useTranslation();

  // Lift i18n labels out of memo for clarity
  const selectAllLabel = t("workbenchBar.selectAll", "Select All");
  const deselectAllLabel = t("workbenchBar.deselectAll", "Deselect All");
  const selectByNumberLabel = t(
    "workbenchBar.selectByNumber",
    "Select by Page Numbers",
  );
  const deleteSelectedLabel = t(
    "workbenchBar.deleteSelected",
    "Delete Selected Pages",
  );
  const exportSelectedLabel = t(
    "workbenchBar.exportSelected",
    "Export Selected Pages",
  );
  const saveChangesLabel = t("workbenchBar.saveChanges", "Save Changes");
  const buttons = useMemo<WorkbenchBarButtonWithAction[]>(() => {
    return [
      {
        id: "page-select-all",
        icon: <SelectAllIcon width="1.5rem" height="1.5rem" />,
        tooltip: selectAllLabel,
        ariaLabel: selectAllLabel,
        section: "top" as const,
        order: 10,
        disabled: totalPages === 0 || selectedPageCount === totalPages,
        visible: totalPages > 0,
        onClick: handleSelectAll,
      },
      {
        id: "page-deselect-all",
        icon: <CropSquareIcon width="1.5rem" height="1.5rem" />,
        tooltip: deselectAllLabel,
        ariaLabel: deselectAllLabel,
        section: "top" as const,
        order: 20,
        disabled: selectedPageCount === 0,
        visible: totalPages > 0,
        onClick: handleDeselectAll,
      },
      {
        id: "page-select-by-number",
        tooltip: selectByNumberLabel,
        ariaLabel: selectByNumberLabel,
        section: "top" as const,
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
        id: "page-delete-selected",
        icon: <DeleteOutlineRoundedIcon width="1.5rem" height="1.5rem" />,
        tooltip: deleteSelectedLabel,
        ariaLabel: deleteSelectedLabel,
        section: "top" as const,
        order: 40,
        disabled: selectedPageCount === 0,
        visible: totalPages > 0,
        onClick: handleDelete,
      },
      {
        id: "page-export-selected",
        icon: <DownloadIcon width="1.5rem" height="1.5rem" />,
        tooltip: exportSelectedLabel,
        ariaLabel: exportSelectedLabel,
        section: "top" as const,
        order: 50,
        disabled: selectedPageCount === 0 || exportLoading,
        visible: totalPages > 0,
        onClick: onExportSelected,
      },
      {
        id: "page-save-changes",
        icon: <SaveIcon width="1.5rem" height="1.5rem" />,
        tooltip: saveChangesLabel,
        ariaLabel: saveChangesLabel,
        section: "top" as const,
        order: 55,
        disabled: totalPages === 0 || exportLoading,
        visible: totalPages > 0,
        onClick: onSaveChanges,
      },
    ];
  }, [
    t,
    i18n.language,
    selectAllLabel,
    deselectAllLabel,
    selectByNumberLabel,
    deleteSelectedLabel,
    exportSelectedLabel,
    saveChangesLabel,
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
  ]);

  useWorkbenchBarButtons(buttons);
}
