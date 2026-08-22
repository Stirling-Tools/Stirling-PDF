import React, { useEffect, useMemo, useState } from "react";
import { Stack, Text, Box, Group, Center, Loader } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import CropAreaSelector from "@app/components/tools/crop/CropAreaSelector";
import DocumentThumbnail from "@app/components/shared/filePreview/DocumentThumbnail";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import { PAGE_SIZES } from "@app/constants/pageSizeConstants";
import { DEFAULT_SIGNATURE_BOX } from "@app/constants/certSignConstants";
import {
  calculatePDFBounds,
  constrainCropAreaToPDF,
  PDFBounds,
  Rectangle,
  roundCropArea,
} from "@app/utils/cropCoordinates";

/** Side of the square preview, in pixels. */
const CONTAINER_SIZE = 300;

interface SignaturePlacementPickerProps {
  /** The PDF being signed; its page size sets the coordinate space. */
  file: File | null;
  /** File stub used to render the page thumbnail. */
  fileStub: unknown;
  thumbnailUrl: string | null;
  /** 1-based page the signature goes on. */
  pageNumber: number;
  /** Current box in PDF points, or undefined while none has been placed. */
  signatureArea?: Rectangle;
  onSignatureAreaChange: (area: Rectangle | undefined) => void;
  disabled?: boolean;
}

/**
 * Lets the user drag the signature box onto the page.
 *
 * Reuses the crop tool's selector so the interaction - drag to draw, drag inside to
 * move, corner handles to resize - is the one users already know, and so both tools
 * share a single implementation of the DOM-to-PDF coordinate maths.
 */
const SignaturePlacementPicker: React.FC<SignaturePlacementPickerProps> = ({
  file,
  fileStub,
  thumbnailUrl,
  pageNumber,
  signatureArea,
  onSignatureAreaChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [pdfBounds, setPdfBounds] = useState<PDFBounds | null>(null);
  const [loading, setLoading] = useState(false);

  // The page the signature lands on decides the coordinate space, so the bounds are
  // read from that page rather than the first one - they differ in mixed-size PDFs.
  useEffect(() => {
    let cancelled = false;

    const loadPageBounds = async () => {
      if (!file) {
        setPdfBounds(null);
        return;
      }
      setLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfWorkerManager.createDocument(arrayBuffer);
        try {
          const index = Math.min(Math.max(pageNumber, 1), pdf.numPages);
          const page = await pdf.getPage(index);
          const viewport = page.getViewport({ scale: 1 });
          if (!cancelled) {
            setPdfBounds(
              calculatePDFBounds(
                viewport.width,
                viewport.height,
                CONTAINER_SIZE,
                CONTAINER_SIZE,
              ),
            );
          }
        } finally {
          pdfWorkerManager.destroyDocument(pdf);
        }
      } catch (error) {
        console.error(
          "Failed to read page size for signature placement:",
          error,
        );
        // A4 keeps the picker usable; the backend clamps anything that overflows.
        if (!cancelled) {
          setPdfBounds(
            calculatePDFBounds(
              PAGE_SIZES.A4.width,
              PAGE_SIZES.A4.height,
              CONTAINER_SIZE,
              CONTAINER_SIZE,
            ),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPageBounds();
    return () => {
      cancelled = true;
    };
  }, [file, pageNumber]);

  /**
   * The box shown before the user has drawn one: bottom-right of the page, where a
   * signature conventionally goes, with a margin so it does not touch the edges.
   */
  const displayedArea = useMemo<Rectangle | null>(() => {
    if (signatureArea) return signatureArea;
    if (!pdfBounds) return null;
    const margin = 40;
    return {
      x: Math.max(
        0,
        pdfBounds.actualWidth - DEFAULT_SIGNATURE_BOX.width - margin,
      ),
      y: margin,
      width: DEFAULT_SIGNATURE_BOX.width,
      height: DEFAULT_SIGNATURE_BOX.height,
    };
  }, [signatureArea, pdfBounds]);

  const handleChange = (area: Rectangle) => {
    if (!pdfBounds) return;
    onSignatureAreaChange(
      roundCropArea(constrainCropAreaToPDF(area, pdfBounds)),
    );
  };

  if (!file) {
    return (
      <Text size="xs" c="dimmed">
        {t(
          "certSign.placement.noFile",
          "Select a PDF to choose where the signature goes.",
        )}
      </Text>
    );
  }

  if (loading || !pdfBounds || !displayedArea) {
    return (
      <Center style={{ height: CONTAINER_SIZE }}>
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          {t("certSign.placement.title", "Signature position")}
        </Text>
        <ActionIcon
          variant="secondary"
          onClick={() => onSignatureAreaChange(undefined)}
          disabled={disabled || !signatureArea}
          title={t("certSign.placement.reset", "Use the default position")}
          aria-label={t("certSign.placement.reset", "Use the default position")}
        >
          <RestartAltIcon style={{ fontSize: "1rem" }} />
        </ActionIcon>
      </Group>

      <Text size="xs" c="dimmed">
        {t(
          "certSign.placement.hint",
          "Drag on the page to place the signature. The text scales to fit the box you draw.",
        )}
      </Text>

      <Center>
        <Box
          style={{
            width: CONTAINER_SIZE,
            height: CONTAINER_SIZE,
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: "8px",
            backgroundColor: "var(--mantine-color-gray-0)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <CropAreaSelector
            pdfBounds={pdfBounds}
            cropArea={displayedArea}
            onCropAreaChange={handleChange}
            disabled={disabled}
          >
            <DocumentThumbnail
              file={fileStub as never}
              thumbnail={thumbnailUrl}
              style={{
                width: pdfBounds.thumbnailWidth,
                height: pdfBounds.thumbnailHeight,
                position: "absolute",
                left: pdfBounds.offsetX,
                top: pdfBounds.offsetY,
              }}
            />
          </CropAreaSelector>
        </Box>
      </Center>

      {signatureArea && (
        <Text size="xs" c="dimmed" ta="center">
          {t("certSign.placement.coordinates", {
            defaultValue: "x {{x}}, y {{y}} · {{width}} × {{height}} pt",
            x: Math.round(signatureArea.x),
            y: Math.round(signatureArea.y),
            width: Math.round(signatureArea.width),
            height: Math.round(signatureArea.height),
          })}
        </Text>
      )}
    </Stack>
  );
};

export default SignaturePlacementPicker;
