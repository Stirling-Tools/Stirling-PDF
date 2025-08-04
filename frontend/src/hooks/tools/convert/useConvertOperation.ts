import { useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ConvertParameters } from './useConvertParameters';
import { detectFileExtension } from '../../../utils/fileUtils';
import { createFileFromApiResponse } from '../../../utils/fileResponseUtils';
import { useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';

import { getEndpointUrl, isImageFormat, isWebFormat } from '../../../utils/convertUtils';


const shouldProcessFilesSeparately = (
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

const createFileFromResponse = (
  responseData: any,
  headers: any,
  originalFileName: string,
  targetExtension: string
): File => {
  const originalName = originalFileName.split('.')[0];
  const fallbackFilename = `${originalName}_converted.${targetExtension}`;
  
  return createFileFromApiResponse(responseData, headers, fallbackFilename);
};

const buildFormData = (parameters: ConvertParameters, selectedFiles: File[]): FormData => {
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

export const useConvertOperation = () => {
  const { t } = useTranslation();
  

  return useToolOperation<ConvertParameters>({
    operationType: 'convert',
    endpoint: (params) => getEndpointUrl(params.fromExtension, params.toExtension) || '',
    buildFormData: buildFormData, // Clean multi-file signature: (params, selectedFiles) => FormData
    filePrefix: 'converted_',
    responseHandler: {
      type: 'single'
    },
    validateParams: (params) => {
      // Add any validation if needed
      return { valid: true };
    },
    getErrorMessage: (error) => {
      if (error.response?.data && typeof error.response.data === 'string') {
        return error.response.data;
      }
      if (error.message) {
        return error.message;
      }
      return t("convert.errorConversion", "An error occurred while converting the file.");
    }
  });
};