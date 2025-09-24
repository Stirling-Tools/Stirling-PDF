import React from 'react';
import i18n from '../../../i18n';
import FileStatusIndicator from './FileStatusIndicator';
import { StirlingFile } from '../../../types/fileContext';

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
  const title = i18n.t('files.title', { defaultValue: 'Files' });

  return createStep(title, {
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
