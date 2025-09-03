import React from 'react';
import { useTranslation } from 'react-i18next';
import FileStatusIndicator from './FileStatusIndicator';
import { FileWithId } from '../../../types/fileContext';

export interface FilesToolStepProps {
  selectedFiles: FileWithId[];
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
  placeholder?: string;
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
      placeholder={props.placeholder || t("files.placeholder", "Select a PDF file in the main view to get started")}
    />
  ));
}
