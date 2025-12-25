import { useCallback } from 'react';
import apiClient from '@app/services/apiClient';
import { useTranslation } from 'react-i18next';
import { ConvertParameters, defaultParameters } from '@app/hooks/tools/convert/useConvertParameters';
import { createFileFromApiResponse } from '@app/utils/fileResponseUtils';
import { useToolOperation, ToolType, CustomProcessorResult } from '@app/hooks/tools/shared/useToolOperation';
import { getEndpointUrl, isImageFormat, isWebFormat, isOfficeFormat } from '@app/utils/convertUtils';

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
    // PDF to PDF/A and PDF/X conversions (each PDF should be processed separately)
    (parameters.fromExtension === 'pdf' && (parameters.toExtension === 'pdfa' || parameters.toExtension === 'pdfx')) ||
    // PDF to text-like formats should be one output per input
    (parameters.fromExtension === 'pdf' && ['txt', 'rtf', 'csv'].includes(parameters.toExtension)) ||
    // PDF to office format conversions (each PDF should generate its own office file)
    (parameters.fromExtension === 'pdf' && isOfficeFormat(parameters.toExtension)) ||
    // Office files to PDF conversions (each file should be processed separately via LibreOffice)
    (isOfficeFormat(parameters.fromExtension) && parameters.toExtension === 'pdf') ||
    // Web files to PDF conversions (each web file should generate its own PDF)
    ((isWebFormat(parameters.fromExtension) || parameters.fromExtension === 'web') &&
     parameters.toExtension === 'pdf') ||
    // eBook files to PDF conversions (each file should be processed separately via Calibre)
    (['epub', 'mobi', 'azw3', 'fb2'].includes(parameters.fromExtension) && parameters.toExtension === 'pdf') ||
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

  const { fromExtension, toExtension, imageOptions, htmlOptions, emailOptions, pdfaOptions, pdfxOptions, cbzOptions, cbzOutputOptions, ebookOptions } = parameters;

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
  } else if (fromExtension === 'pdf' && toExtension === 'pdfx') {
    // Use PDF/A endpoint with PDF/X format parameter
    formData.append("outputFormat", pdfxOptions?.outputFormat || 'pdfx-1');
  } else if (fromExtension === 'pdf' && toExtension === 'csv') {
    formData.append("pageNumbers", "all");
  } else if (fromExtension === 'cbz' && toExtension === 'pdf') {
    formData.append("optimizeForEbook", (cbzOptions?.optimizeForEbook ?? false).toString());
  } else if (fromExtension === 'pdf' && toExtension === 'cbz') {
    formData.append("dpi", (cbzOutputOptions?.dpi ?? 150).toString());
  } else if (['epub', 'mobi', 'azw3', 'fb2'].includes(fromExtension) && toExtension === 'pdf') {
    formData.append("embedAllFonts", (ebookOptions?.embedAllFonts ?? false).toString());
    formData.append("includeTableOfContents", (ebookOptions?.includeTableOfContents ?? false).toString());
    formData.append("includePageNumbers", (ebookOptions?.includePageNumbers ?? false).toString());
    formData.append("optimizeForEbook", (ebookOptions?.optimizeForEbook ?? false).toString());
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

  // Map both pdfa and pdfx to pdf since they both result in PDF files
  if (targetExtension == 'pdfa' || targetExtension == 'pdfx') {
    targetExtension = 'pdf';
  }

  const fallbackFilename = `${originalName}.${targetExtension}`;

  return createFileFromApiResponse(responseData, headers, fallbackFilename);
};

// Static processor that can be used by both the hook and automation executor
export const convertProcessor = async (
  parameters: ConvertParameters,
  selectedFiles: File[]
): Promise<CustomProcessorResult> => {
  const processedFiles: File[] = [];

  // Map PDF/X to use PDF/A endpoint
  const actualToExtension = parameters.toExtension === 'pdfx' ? 'pdfa' : parameters.toExtension;
  const endpoint = getEndpointUrl(parameters.fromExtension, actualToExtension);

  if (!endpoint) {
    throw new Error('Unsupported conversion format');
  }

  // Convert-specific routing logic: decide batch vs individual processing
  // For PDF/X, we want to treat it similar to PDF/A (separate processing)
  const isSeparateProcessing = shouldProcessFilesSeparately(selectedFiles, {
    ...parameters,
    toExtension: actualToExtension  // Use the mapped extension for decision logic
  });

  if (isSeparateProcessing) {
    // Individual processing for complex cases (PDF→image, smart detection, etc.)
    for (const file of selectedFiles) {
      try {
        const formData = buildConvertFormData(parameters, [file]);
        const response = await apiClient.post(endpoint, formData, { responseType: 'blob' });

        const convertedFile = createFileFromResponse(response.data, response.headers, file.name, actualToExtension === 'pdfa' ? 'pdfx' : parameters.toExtension);

        processedFiles.push(convertedFile);
      } catch (error) {
        console.warn(`Failed to convert file ${file.name}:`, error);
      }
    }
  } else {
    // Batch processing for simple cases (image→PDF combine)
    const formData = buildConvertFormData(parameters, selectedFiles);
    const response = await apiClient.post(endpoint, formData, { responseType: 'blob' });

    const baseFilename = selectedFiles.length === 1
      ? selectedFiles[0].name
      : 'converted_files';

    const convertedFile = createFileFromResponse(response.data, response.headers, baseFilename, actualToExtension === 'pdfa' ? 'pdfx' : parameters.toExtension);
    processedFiles.push(convertedFile);
  }

  // When batch processing multiple files into one output (e.g., 3 images → 1 PDF),
  // mark all inputs as consumed even though there's only 1 output file
  const isCombiningMultiple = !isSeparateProcessing && selectedFiles.length > 1;

  return {
    files: processedFiles,
    consumedAllInputs: isCombiningMultiple,
  };
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
  ): Promise<CustomProcessorResult> => {
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
