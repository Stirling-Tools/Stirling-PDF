import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { FakeScanParameters, defaultParameters } from './useFakeScanParameters';

export const buildFakeScanFormData = (parameters: FakeScanParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('quality', parameters.quality);
  formData.append('rotation', parameters.rotation);
  formData.append('advancedEnabled', String(parameters.advancedEnabled));
  if (parameters.advancedEnabled) {
    formData.append('colorspace', parameters.colorspace);
    formData.append('border', String(parameters.border));
    formData.append('rotate', String(parameters.rotate));
    formData.append('rotateVariance', String(parameters.rotateVariance));
    formData.append('brightness', String(parameters.brightness));
    formData.append('contrast', String(parameters.contrast));
    formData.append('blur', String(parameters.blur));
    formData.append('noise', String(parameters.noise));
    formData.append('yellowish', String(parameters.yellowish));
    formData.append('resolution', String(parameters.resolution));
  }
  return formData;
};

export const fakeScanOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildFakeScanFormData,
  operationType: 'fakeScan',
  endpoint: '/api/v1/misc/scanner-effect',
  defaultParameters,
} as const;

export const useFakeScanOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<FakeScanParameters>({
    ...fakeScanOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('fakeScan.error.failed', 'An error occurred while applying the scanner effect.')
    )
  });
};


