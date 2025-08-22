import React from 'react';
import { useTranslation } from 'react-i18next';
import FileStatusIndicator from './FileStatusIndicator';

export interface FilesToolStepProps {
  selectedFiles: File[];
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
  placeholder?: string;
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
      placeholder={props.placeholder || t("files.placeholder", "Select a PDF file in the main view to get started")}
      minFiles={props.minFiles}
    />
  ));
}
