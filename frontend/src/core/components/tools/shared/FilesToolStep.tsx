import React from 'react';
import FileStatusIndicator from '@app/components/tools/shared/FileStatusIndicator';
import { StirlingFile } from '@app/types/fileContext';
import i18n from '@app/i18n';

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
  return createStep(i18n.t("files.title", "Files"), {
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
