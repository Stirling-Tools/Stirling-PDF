import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import React from 'react';
import LocalIcon from '../../../components/shared/LocalIcon';
import { SuggestedAutomation } from '../../../types/automation';

// Create icon components
const CompressIcon = () => React.createElement(LocalIcon, { icon: 'compress', width: '1.5rem', height: '1.5rem' });
const TextFieldsIcon = () => React.createElement(LocalIcon, { icon: 'text-fields', width: '1.5rem', height: '1.5rem' });
const SecurityIcon = () => React.createElement(LocalIcon, { icon: 'security', width: '1.5rem', height: '1.5rem' });
const StarIcon = () => React.createElement(LocalIcon, { icon: 'star', width: '1.5rem', height: '1.5rem' });

export function useSuggestedAutomations(): SuggestedAutomation[] {
  const { t } = useTranslation();

  const suggestedAutomations = useMemo<SuggestedAutomation[]>(() => {
    const now = new Date().toISOString();
    return [
      {
        id: "secure-pdf-ingestion",
        name: t("automation.suggested.securePdfIngestion", "Secure PDF Ingestion"),
        description: t("automation.suggested.securePdfIngestionDesc", "Comprehensive PDF processing workflow that sanitizes documents, applies OCR with cleanup, converts to PDF/A format for long-term archival, and optimizes file size."),
        operations: [
          {
            operation: "sanitize",
            parameters: {
              removeJavaScript: true,
              removeEmbeddedFiles: true,
              removeXMPMetadata: true,
              removeMetadata: true,
              removeLinks: false,
              removeFonts: false,
            }
          },
          {
            operation: "ocr",
            parameters: {
              languages: ['eng'],
              ocrType: 'skip-text',
              ocrRenderType: 'hocr',
              additionalOptions: ['clean', 'cleanFinal'],
            }
          },
          {
            operation: "convert",
            parameters: {
              fromExtension: 'pdf',
              toExtension: 'pdfa',
              pdfaOptions: {
                outputFormat: 'pdfa-1',
              }
            }
          },
          {
            operation: "compress",
            parameters: {
              compressionLevel: 5,
              grayscale: false,
              expectedSize: '',
              compressionMethod: 'quality',
              fileSizeValue: '',
              fileSizeUnit: 'MB',
            }
          }
        ],
        createdAt: now,
        updatedAt: now,
        icon: SecurityIcon,
      },
      {
        id: "email-preparation",
        name: t("automation.suggested.emailPreparation", "Email Preparation"),
        description: t("automation.suggested.emailPreparationDesc", "Optimizes PDFs for email distribution by compressing files, splitting large documents into 20MB chunks for email compatibility, and removing metadata for privacy."),
        operations: [
          {
            operation: "compress",
            parameters: {
              compressionLevel: 5,
              grayscale: false,
              expectedSize: '',
              compressionMethod: 'quality',
              fileSizeValue: '',
              fileSizeUnit: 'MB',
            }
          },
          {
            operation: "splitPdf",
            parameters: {
              mode: 'bySizeOrCount',
              pages: '',
              hDiv: '1',
              vDiv: '1',
              merge: false,
              splitType: 'size',
              splitValue: '20MB',
              bookmarkLevel: '1',
              includeMetadata: false,
              allowDuplicates: false,
            }
          },
          {
            operation: "sanitize",
            parameters: {
              removeJavaScript: false,
              removeEmbeddedFiles: false,
              removeXMPMetadata: true,
              removeMetadata: true,
              removeLinks: false,
              removeFonts: false,
            }
          }
        ],
        createdAt: now,
        updatedAt: now,
        icon: CompressIcon,
      },
      {
        id: "secure-workflow",
        name: t("automation.suggested.secureWorkflow", "Security Workflow"),
        description: t("automation.suggested.secureWorkflowDesc", "Secures PDF documents by removing potentially malicious content like JavaScript and embedded files, then adds password protection to prevent unauthorized access. Password is set to 'password' by default."),
        operations: [
          {
            operation: "sanitize",
            parameters: {
              removeJavaScript: true,
              removeEmbeddedFiles: true,
              removeXMPMetadata: false,
              removeMetadata: false,
              removeLinks: false,
              removeFonts: false,
            }
          },
          {
            operation: "addPassword",
            parameters: {
              password: 'password',
              ownerPassword: '',
              keyLength: 128,
              permissions: {
                preventAssembly: false,
                preventExtractContent: false,
                preventExtractForAccessibility: false,
                preventFillInForm: false,
                preventModify: false,
                preventModifyAnnotations: false,
                preventPrinting: false,
                preventPrintingFaithful: false,
              }
            }
          }
        ],
        createdAt: now,
        updatedAt: now,
        icon: SecurityIcon,
      },
      {
        id: "process-images",
        name: t("automation.suggested.processImages", "Process Images"),
        description: t("automation.suggested.processImagesDesc", "Converts multiple image files into a single PDF document, then applies OCR technology to extract searchable text from the images."),
        operations: [
          {
            operation: "convert",
            parameters: {
              fromExtension: 'image',
              toExtension: 'pdf',
              imageOptions: {
                colorType: 'color',
                dpi: 300,
                singleOrMultiple: 'multiple',
                fitOption: 'maintainAspectRatio',
                autoRotate: true,
                combineImages: true,
              }
            }
          },
          {
            operation: "ocr",
            parameters: {
              languages: ['eng'],
              ocrType: 'skip-text',
              ocrRenderType: 'hocr',
              additionalOptions: [],
            }
          }
        ],
        createdAt: now,
        updatedAt: now,
        icon: StarIcon,
      },
    ];
  }, [t]);

  return suggestedAutomations;
}
