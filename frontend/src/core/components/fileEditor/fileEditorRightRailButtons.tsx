import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRightRailButtons, RightRailButtonWithAction } from '@app/hooks/useRightRailButtons';
import LocalIcon from '@app/components/shared/LocalIcon';

interface FileEditorRightRailButtonsParams {
  totalItems: number;
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCloseSelected: () => void;
}

export function useFileEditorRightRailButtons({
  totalItems,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onCloseSelected,
}: FileEditorRightRailButtonsParams) {
  const { t, i18n } = useTranslation();

  const buttons = useMemo<RightRailButtonWithAction[]>(() => [
    {
      id: 'file-select-all',
      icon: <LocalIcon icon="select-all" width="1.5rem" height="1.5rem" />,
      tooltip: t('rightRail.selectAll', 'Select All'),
      ariaLabel: typeof t === 'function' ? t('rightRail.selectAll', 'Select All') : 'Select All',
      section: 'top' as const,
      order: 10,
      disabled: totalItems === 0 || selectedCount === totalItems,
      visible: totalItems > 0,
      onClick: onSelectAll,
    },
    {
      id: 'file-deselect-all',
      icon: <LocalIcon icon="crop-square-outline" width="1.5rem" height="1.5rem" />,
      tooltip: t('rightRail.deselectAll', 'Deselect All'),
      ariaLabel: typeof t === 'function' ? t('rightRail.deselectAll', 'Deselect All') : 'Deselect All',
      section: 'top' as const,
      order: 20,
      disabled: selectedCount === 0,
      visible: totalItems > 0,
      onClick: onDeselectAll,
    },
    {
      id: 'file-close-selected',
      icon: <LocalIcon icon="close-rounded" width="1.5rem" height="1.5rem" />,
      tooltip: t('rightRail.closeSelected', 'Close Selected Files'),
      ariaLabel: typeof t === 'function' ? t('rightRail.closeSelected', 'Close Selected Files') : 'Close Selected Files',
      section: 'top' as const,
      order: 30,
      disabled: selectedCount === 0,
      visible: totalItems > 0,
      onClick: onCloseSelected,
    },
  ], [t, i18n.language, totalItems, selectedCount, onSelectAll, onDeselectAll, onCloseSelected]);

  useRightRailButtons(buttons);
}
