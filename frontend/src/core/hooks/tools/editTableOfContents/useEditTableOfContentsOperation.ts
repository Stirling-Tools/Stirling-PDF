import { useTranslation } from 'react-i18next';
import { ToolType, type ToolOperationConfig, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { EditTableOfContentsParameters } from '@app/hooks/tools/editTableOfContents/useEditTableOfContentsParameters';
import { serializeBookmarkNodes } from '@app/utils/editTableOfContents';

const buildFormData = (parameters: EditTableOfContentsParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('replaceExisting', String(parameters.replaceExisting));
  formData.append('bookmarkData', JSON.stringify(serializeBookmarkNodes(parameters.bookmarks)));
  return formData;
};

export const editTableOfContentsOperationConfig: ToolOperationConfig<EditTableOfContentsParameters> = {
  toolType: ToolType.singleFile,
  operationType: 'editTableOfContents',
  endpoint: '/api/v1/general/edit-table-of-contents',
  buildFormData,
};

export const useEditTableOfContentsOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<EditTableOfContentsParameters>({
    ...editTableOfContentsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('editTableOfContents.error.failed', 'Failed to update the table of contents')
    ),
  });
};

