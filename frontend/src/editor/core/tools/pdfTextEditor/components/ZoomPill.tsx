import { Group, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/types";
import {
  clampRenderScale,
  fitToWidthScale,
} from "@app/tools/pdfTextEditor/util/fitToWidth";

const Z_STEP = 0.25;

interface Props {
  store: EditorStore;
  renderScale: number;
  pages: PageSnapshot[];
  fitPaddingPx: number;
  compact?: boolean;
}

/**
 * Zoom, floating over the pages it scales.
 *
 * Anchored to the canvas because it is a view control: it belongs beside what
 * it acts on. Ctrl+wheel on the stage drives the same store field.
 */
export function ZoomPill({
  store,
  renderScale,
  pages,
  fitPaddingPx,
  compact = false,
}: Props) {
  const { t } = useTranslation();
  const zoomTo = (scale: number) =>
    store.setRenderScale(clampRenderScale(scale));
  const inset = compact ? 10 : 18;

  return (
    <Group
      gap={2}
      wrap="nowrap"
      p={4}
      data-testid="pdf-editor-zoom-controls"
      style={{
        position: "absolute",
        right: inset,
        bottom: inset,
        zIndex: 50,
        borderRadius: 999,
        border: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-body)",
        boxShadow: "0 3px 14px rgba(0, 0, 0, 0.14)",
      }}
    >
      <Button
        size="sm"
        variant="tertiary"
        accent="neutral"
        aria-label={t("pdfTextEditor.zoom.out", "Zoom out")}
        data-testid="pdf-editor-zoom-out"
        onClick={() => zoomTo(renderScale - Z_STEP)}
      >
        −
      </Button>
      {/* The readout doubles as the reset control: a separate "100%" button
          beside a "150%" readout read as two zoom values. */}
      <Tooltip label={t("pdfTextEditor.zoom.reset", "Reset zoom to 100%")}>
        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          data-testid="pdf-editor-zoom-reset"
          onClick={() => store.setRenderScale(1)}
        >
          <Text
            size="xs"
            miw={38}
            ta="center"
            data-testid="pdf-editor-zoom-percent"
          >
            {Math.round(renderScale * 100)}%
          </Text>
        </Button>
      </Tooltip>
      <Button
        size="sm"
        variant="tertiary"
        accent="neutral"
        aria-label={t("pdfTextEditor.zoom.in", "Zoom in")}
        data-testid="pdf-editor-zoom-in"
        onClick={() => zoomTo(renderScale + Z_STEP)}
      >
        +
      </Button>
      <Button
        size="sm"
        variant="tertiary"
        accent="neutral"
        aria-label={t("pdfTextEditor.zoom.fitToWidth", "Fit to width")}
        data-testid="pdf-editor-zoom-fit"
        onClick={() => {
          const stage = document.querySelector<HTMLElement>(
            '[data-testid="pdf-editor-stage"]',
          );
          const firstPage = pages[0];
          if (!stage || !firstPage) return;
          store.setRenderScale(
            fitToWidthScale(stage.clientWidth, firstPage.width, fitPaddingPx),
          );
        }}
      >
        {t("pdfTextEditor.zoom.fit", "Fit")}
      </Button>
    </Group>
  );
}
