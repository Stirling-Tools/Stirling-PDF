import React from 'react';
import { useTranslation } from 'react-i18next';
import FileStatusIndicator from '@app/components/tools/shared/FileStatusIndicator';
import { StirlingFile } from '@app/types/fileContext';

export interface FilesToolStepProps {
  selectedFiles: StirlingFile[];
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
  minFiles?: number;
}

export function createFilesToolStep(
  createStep: (title: string, props: any, children?: React.ReactNode) => React.ReactElement,
  props: FilesToolStepProps
): React.ReactElement {
  const { t } = useTranslation();

  return createStep(t("files.title", "Files"), {
    isVisible: true,
    isCollapsed: props.isCollapsed,
    onCollapsedClick: props.onCollapsedClick
  }, (
    <FileStatusIndicator
      selectedFiles={props.selectedFiles}
      minFiles={props.minFiles}
    />
  ));
}
