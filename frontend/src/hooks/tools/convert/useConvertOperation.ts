import { useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ConvertParameters, defaultParameters } from './useConvertParameters';
import { createFileFromApiResponse } from '../../../utils/fileResponseUtils';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { getEndpointUrl, isImageFormat, isWebFormat } from '../../../utils/convertUtils';

// Static function that can be used by both the hook and automation executor
export const shouldProcessFilesSeparately = (
  selectedFiles: File[],
  parameters: ConvertParameters
): boolean => {
  return selectedFiles.length > 1 && (
    // Image to PDF with combineImages = false
    ((isImageFormat(parameters.fromExtension) || parameters.fromExtension === 'image') &&
     parameters.toExtension === 'pdf' && !parameters.imageOptions.combineImages) ||
    // PDF to image conversions (each PDF should generate its own image file)
    (parameters.fromExtension === 'pdf' && isImageFormat(parameters.toExtension)) ||
    // PDF to PDF/A conversions (each PDF should be processed separately)
    (parameters.fromExtension === 'pdf' && parameters.toExtension === 'pdfa') ||
    // Web files to PDF conversions (each web file should generate its own PDF)
    ((isWebFormat(parameters.fromExtension) || parameters.fromExtension === 'web') &&
     parameters.toExtension === 'pdf') ||
    // Web files smart detection
    (parameters.isSmartDetection && parameters.smartDetectionType === 'web') ||
    // Mixed file types (smart detection)
    (parameters.isSmartDetection && parameters.smartDetectionType === 'mixed')
  );
};

// Static function that can be used by both the hook and automation executor
export const buildConvertFormData = (parameters: ConvertParameters, selectedFiles: File[]): FormData => {
  const formData = new FormData();

  selectedFiles.forEach(file => {
    formData.append("fileInput", file);
  });

  const { fromExtension, toExtension, imageOptions, htmlOptions, emailOptions, pdfaOptions } = parameters;

  if (isImageFormat(toExtension)) {
    formData.append("imageFormat", toExtension);
    formData.append("colorType", imageOptions.colorType);
    formData.append("dpi", imageOptions.dpi.toString());
    formData.append("singleOrMultiple", imageOptions.singleOrMultiple);
  } else if (fromExtension === 'pdf' && ['docx', 'odt'].includes(toExtension)) {
    formData.append("outputFormat", toExtension);
  } else if (fromExtension === 'pdf' && ['pptx', 'odp'].includes(toExtension)) {
    formData.append("outputFormat", toExtension);
  } else if (fromExtension === 'pdf' && ['txt', 'rtf'].includes(toExtension)) {
    formData.append("outputFormat", toExtension);
  } else if ((isImageFormat(fromExtension) || fromExtension === 'image') && toExtension === 'pdf') {
    formData.append("fitOption", imageOptions.fitOption);
    formData.append("colorType", imageOptions.colorType);
    formData.append("autoRotate", imageOptions.autoRotate.toString());
  } else if ((fromExtension === 'html' || fromExtension === 'zip') && toExtension === 'pdf') {
    formData.append("zoom", htmlOptions.zoomLevel.toString());
  } else if (fromExtension === 'eml' && toExtension === 'pdf') {
    formData.append("includeAttachments", emailOptions.includeAttachments.toString());
    formData.append("maxAttachmentSizeMB", emailOptions.maxAttachmentSizeMB.toString());
    formData.append("downloadHtml", emailOptions.downloadHtml.toString());
    formData.append("includeAllRecipients", emailOptions.includeAllRecipients.toString());
  } else if (fromExtension === 'pdf' && toExtension === 'pdfa') {
    formData.append("outputFormat", pdfaOptions.outputFormat);
  } else if (fromExtension === 'pdf' && toExtension === 'csv') {
    formData.append("pageNumbers", "all");
  }

  return formData;
};

// Static function that can be used by both the hook and automation executor
export const createFileFromResponse = (
  responseData: any,
  headers: any,
  originalFileName: string,
  targetExtension: string
): File => {
  const originalName = originalFileName.split('.')[0];

  if (targetExtension == 'pdfa') {
    targetExtension = 'pdf';
  }

  const fallbackFilename = `${originalName}.${targetExtension}`;

  return createFileFromApiResponse(responseData, headers, fallbackFilename);
};

// Static processor that can be used by both the hook and automation executor
export const convertProcessor = async (
  parameters: ConvertParameters,
  selectedFiles: File[]
): Promise<File[]> => {
  const processedFiles: File[] = [];
  const endpoint = getEndpointUrl(parameters.fromExtension, parameters.toExtension);

  if (!endpoint) {
    throw new Error('Unsupported conversion format');
  }

  // Convert-specific routing logic: decide batch vs individual processing
  if (shouldProcessFilesSeparately(selectedFiles, parameters)) {
    // Individual processing for complex cases (PDF→image, smart detection, etc.)
    for (const file of selectedFiles) {
      try {
        const formData = buildConvertFormData(parameters, [file]);
        const response = await axios.post(endpoint, formData, { responseType: 'blob' });

        const convertedFile = createFileFromResponse(response.data, response.headers, file.name, parameters.toExtension);

        processedFiles.push(convertedFile);
      } catch (error) {
        console.warn(`Failed to convert file ${file.name}:`, error);
      }
    }
  } else {
    // Batch processing for simple cases (image→PDF combine)
    const formData = buildConvertFormData(parameters, selectedFiles);
    const response = await axios.post(endpoint, formData, { responseType: 'blob' });

    const baseFilename = selectedFiles.length === 1
      ? selectedFiles[0].name
      : 'converted_files';

    const convertedFile = createFileFromResponse(response.data, response.headers, baseFilename, parameters.toExtension);
    processedFiles.push(convertedFile);
  }

  return processedFiles;
};

// Static configuration object
export const convertOperationConfig = {
  toolType: ToolType.custom,
  customProcessor: convertProcessor, // Can't use callback version here
  operationType: 'convert',
  defaultParameters,
} as const;

export const useConvertOperation = () => {
  const { t } = useTranslation();

  const customConvertProcessor = useCallback(async (
    parameters: ConvertParameters,
    selectedFiles: File[]
  ): Promise<File[]> => {
    return convertProcessor(parameters, selectedFiles);
  }, []);

  return useToolOperation<ConvertParameters>({
    ...convertOperationConfig,
    customProcessor: customConvertProcessor, // Use instance-specific processor for translation support
    getErrorMessage: (error) => {
      if (error.response?.data && typeof error.response.data === 'string') {
        return error.response.data;
      }
      if (error.message) {
        return error.message;
      }
      return t("convert.errorConversion", "An error occurred while converting the file.");
    },
  });
};
