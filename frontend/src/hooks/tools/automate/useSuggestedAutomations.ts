import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import CompressIcon from '@mui/icons-material/Compress';
import SecurityIcon from '@mui/icons-material/Security';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import { SuggestedAutomation } from '../../../types/automation';

export function useSuggestedAutomations(): SuggestedAutomation[] {
  const { t } = useTranslation();

  const suggestedAutomations = useMemo<SuggestedAutomation[]>(() => {
    const now = new Date().toISOString();
    return [
      {
        id: "compress-and-split",
        name: t("automation.suggested.compressAndSplit", "Compress & Split"),
        description: t("automation.suggested.compressAndSplitDesc", "Compress PDFs and split them by pages"),
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
              pages: '1',
              hDiv: '2',
              vDiv: '2',
              merge: false,
              splitType: 'pages',
              splitValue: '1',
              bookmarkLevel: '1',
              includeMetadata: false,
              allowDuplicates: false,
            }
          }
        ],
        createdAt: now,
        updatedAt: now,
        icon: CompressIcon,
      },
      {
        id: "ocr-workflow",
        name: t("automation.suggested.ocrWorkflow", "OCR Processing"),
        description: t("automation.suggested.ocrWorkflowDesc", "Extract text from PDFs using OCR technology"),
        operations: [
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
        icon: TextFieldsIcon,
      },
      {
        id: "secure-workflow",
        name: t("automation.suggested.secureWorkflow", "Security Workflow"),
        description: t("automation.suggested.secureWorkflowDesc", "Sanitize PDFs and add password protection"),
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
        id: "optimization-workflow",
        name: t("automation.suggested.optimizationWorkflow", "Optimization Workflow"),
        description: t("automation.suggested.optimizationWorkflowDesc", "Repair and compress PDFs for better performance"),
        operations: [
          {
            operation: "repair",
            parameters: {}
          },
          {
            operation: "compress",
            parameters: {
              compressionLevel: 7,
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
        icon: StarIcon,
      },
    ];
  }, [t]);

  return suggestedAutomations;
}
