import { useMemo, useState, useEffect } from "react";
import { Stack, Text, Box, Group, ActionIcon, Center, Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { CropParametersHook } from "@app/hooks/tools/crop/useCropParameters";
import { useSelectedFiles } from "@app/contexts/file/fileHooks";
import CropAreaSelector from "@app/components/tools/crop/CropAreaSelector";
import CropCoordinateInputs from "@app/components/tools/crop/CropCoordinateInputs";
import { DEFAULT_CROP_AREA } from "@app/constants/cropConstants";
import { PAGE_SIZES } from "@app/constants/pageSizeConstants";
import {
  calculatePDFBounds,
  PDFBounds,
  Rectangle
} from "@app/utils/cropCoordinates";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import DocumentThumbnail from "@app/components/shared/filePreview/DocumentThumbnail";

interface CropSettingsProps {
  parameters: CropParametersHook;
  disabled?: boolean;
}

const CONTAINER_SIZE = 250; // Fit within actual pane width

const CropSettings = ({ parameters, disabled = false }: CropSettingsProps) => {
  const { t } = useTranslation();
  const { selectedFiles, selectedFileStubs } = useSelectedFiles();

  // Get the first selected file for preview
  const selectedStub = useMemo(() => {
    return selectedFileStubs.length > 0 ? selectedFileStubs[0] : null;
  }, [selectedFileStubs]);

  // Get the first selected file for PDF processing
  const selectedFile = useMemo(() => {
    return selectedFiles.length > 0 ? selectedFiles[0] : null;
  }, [selectedFiles]);

  // Get thumbnail for the selected file
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [pdfBounds, setPdfBounds] = useState<PDFBounds | null>(null);

  useEffect(() => {
    const loadPDFDimensions = async () => {
      if (!selectedStub || !selectedFile) {
        setPdfBounds(null);
        setThumbnail(null);
        return;
      }

      setThumbnail(selectedStub.thumbnailUrl || null);

      try {
        // Get PDF dimensions from the actual file
        const arrayBuffer = await selectedFile.arrayBuffer();

        // Load PDF to get actual dimensions
        const pdf = await pdfWorkerManager.createDocument(arrayBuffer, {
          disableAutoFetch: true,
          disableStream: true,
          stopAtErrors: false
        });

        const firstPage = await pdf.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });

        const pdfWidth = viewport.width;
        const pdfHeight = viewport.height;

        const bounds = calculatePDFBounds(pdfWidth, pdfHeight, CONTAINER_SIZE, CONTAINER_SIZE);
        setPdfBounds(bounds);

        // Initialize crop area to full PDF if parameters are still default
        if (parameters.parameters.cropArea === DEFAULT_CROP_AREA) {
          parameters.resetToFullPDF(bounds);
        }

        // Cleanup PDF
        pdfWorkerManager.destroyDocument(pdf);
      } catch (error) {
        console.error('Failed to load PDF dimensions:', error);
        // Fallback to A4 dimensions if PDF loading fails
        const bounds = calculatePDFBounds(PAGE_SIZES.A4.width, PAGE_SIZES.A4.height, CONTAINER_SIZE, CONTAINER_SIZE);
        setPdfBounds(bounds);

        if (parameters.parameters.cropArea.width === PAGE_SIZES.A4.width && parameters.parameters.cropArea.height === PAGE_SIZES.A4.height) {
          parameters.resetToFullPDF(bounds);
        }
      }
    };

    loadPDFDimensions();
  }, [selectedStub, selectedFile, parameters]);

  // Listen for tour events to set crop area
  useEffect(() => {
    const handleSetCropArea = (event: Event) => {
      const customEvent = event as CustomEvent<Rectangle>;
      if (customEvent.detail && pdfBounds) {
        parameters.setCropArea(customEvent.detail, pdfBounds);
      }
    };

    window.addEventListener('tour:setCropArea', handleSetCropArea);
    return () => window.removeEventListener('tour:setCropArea', handleSetCropArea);
  }, [parameters, pdfBounds]);

  // Current crop area
  const cropArea = parameters.getCropArea();


  // Handle crop area changes from the selector
  const handleCropAreaChange = (newCropArea: Rectangle) => {
    if (pdfBounds) {
      parameters.setCropArea(newCropArea, pdfBounds);
    }
  };

  // Handle manual coordinate input changes
  const handleCoordinateChange = (field: keyof Rectangle, value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return;

    const newCropArea = { ...cropArea, [field]: numValue };
    if (pdfBounds) {
      parameters.setCropArea(newCropArea, pdfBounds);
    }
  };

  // Reset to full PDF
  const handleReset = () => {
    if (pdfBounds) {
      parameters.resetToFullPDF(pdfBounds);
    }
  };


  if (!selectedStub || !pdfBounds) {
    return (
      <Center style={{ height: '200px' }}>
        <Text color="dimmed">
          {t("crop.noFileSelected", "Select a PDF file to begin cropping")}
        </Text>
      </Center>
    );
  }

  const isCropValid = parameters.isCropAreaValid(pdfBounds);
  const isFullCrop = parameters.isFullPDFCrop(pdfBounds);

  return (
    <Stack gap="md" data-tour="crop-settings">
      {/* PDF Preview with Crop Selector */}
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500}>
            {t("crop.preview.title", "Crop Area Selection")}
          </Text>
          <ActionIcon
            variant="outline"
            onClick={handleReset}
            disabled={disabled || isFullCrop}
            title={t("crop.reset", "Reset to full PDF")}
            aria-label={t("crop.reset", "Reset to full PDF")}
          >
            <RestartAltIcon style={{ fontSize: '1rem' }} />
          </ActionIcon>
        </Group>

        <Center>
          <Box
            style={{
              width: CONTAINER_SIZE,
              height: CONTAINER_SIZE,
              border: '1px solid var(--mantine-color-gray-3)',
              borderRadius: '8px',
              backgroundColor: 'var(--mantine-color-gray-0)',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            <CropAreaSelector
              pdfBounds={pdfBounds}
              cropArea={cropArea}
              onCropAreaChange={handleCropAreaChange}
              disabled={disabled}
            >
              <DocumentThumbnail
                file={selectedStub}
                thumbnail={thumbnail}
                style={{
                  width: pdfBounds.thumbnailWidth,
                  height: pdfBounds.thumbnailHeight,
                  position: 'absolute',
                  left: pdfBounds.offsetX,
                  top: pdfBounds.offsetY
                }}
              />
            </CropAreaSelector>
          </Box>
        </Center>

      </Stack>

      {/* Manual Coordinate Input */}
      <CropCoordinateInputs
        cropArea={cropArea}
        onCoordinateChange={handleCoordinateChange}
        disabled={disabled}
        pdfBounds={pdfBounds}
        showAutomationInfo={false}
      />

      {/* Validation Alert */}
      {!isCropValid && (
        <Alert color="red" variant="light">
          <Text size="xs">
            {t("crop.error.invalidArea", "Crop area extends beyond PDF boundaries")}
          </Text>
        </Alert>
      )}
    </Stack>
  );
};

export default CropSettings;
