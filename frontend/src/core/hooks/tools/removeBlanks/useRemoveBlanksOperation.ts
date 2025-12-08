import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { RemoveBlanksParameters, defaultParameters } from '@app/hooks/tools/removeBlanks/useRemoveBlanksParameters';
import { useToolResources } from '@app/hooks/tools/shared/useToolResources';

export const buildRemoveBlanksFormData = (parameters: RemoveBlanksParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('threshold', String(parameters.threshold));
  formData.append('whitePercent', String(parameters.whitePercent));
  // Note: includeBlankPages is not sent to backend as it always returns both files in a ZIP
  return formData;
};

export const removeBlanksOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRemoveBlanksFormData,
  operationType: 'removeBlanks',
  endpoint: '/api/v1/misc/remove-blanks',
  defaultParameters,
} as const satisfies ToolOperationConfig<RemoveBlanksParameters>;

export const useRemoveBlanksOperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  const responseHandler = useCallback(async (blob: Blob): Promise<File[]> => {
    // Backend always returns a ZIP file containing the processed PDFs
    return await extractZipFiles(blob);
  }, [extractZipFiles]);

  return useToolOperation<RemoveBlanksParameters>({
    ...removeBlanksOperationConfig,
    responseHandler,
    getErrorMessage: createStandardErrorHandler(
      t('removeBlanks.error.failed', 'Failed to remove blank pages')
    )
  });
};


