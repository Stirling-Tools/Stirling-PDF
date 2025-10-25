import React from 'react';
import { useTranslation } from 'react-i18next';
import FileStatusIndicator from './FileStatusIndicator';
import { StirlingFile } from '../../../types/fileContext';

export interface FilesToolStepProps {
  selectedFiles: StirlingFile[];
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
  minFiles?: number;
}

export function CreateFilesToolStep(props: FilesToolStepProps & {
  createStep: (title: string, props: any, children?: React.ReactNode) => React.ReactElement
}): React.ReactElement {
  const { t } = useTranslation();
  const { createStep, ...stepProps } = props;

  return createStep(t("files.title", "Files"), {
    isVisible: true,
    isCollapsed: stepProps.isCollapsed,
    onCollapsedClick: stepProps.onCollapsedClick
  }, (
    <FileStatusIndicator
      selectedFiles={stepProps.selectedFiles}
      minFiles={stepProps.minFiles}
    />
  ));
}

// Backwards compatibility wrapper
export function createFilesToolStep(
  createStep: (title: string, props: any, children?: React.ReactNode) => React.ReactElement,
  props: FilesToolStepProps
): React.ReactElement {
  return <CreateFilesToolStep createStep={createStep} {...props} />;
}
