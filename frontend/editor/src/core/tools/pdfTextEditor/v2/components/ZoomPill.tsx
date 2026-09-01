import { Group, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/v2/types";

const Z_OUT_LIMIT = 0.25;
const Z_IN_LIMIT = 4;
const Z_STEP = 0.25;
const FIT_PAD_PX = 64;

interface Props {
  store: EditorStore;
  renderScale: number;
  pages: PageSnapshot[];
}

/**
 * Zoom, floating over the pages it scales.
 *
 * Anchored to the canvas because it is a view control: it belongs beside what
 * it acts on. Ctrl+wheel on the stage drives the same store field.
 */
export function ZoomPill({ store, renderScale, pages }: Props) {
  const { t } = useTranslation();
  const zoomTo = (scale: number) =>
    store.setRenderScale(
      +Math.min(Z_IN_LIMIT, Math.max(Z_OUT_LIMIT, scale)).toFixed(2),
    );

  return (
    <Group
      gap={2}
      wrap="nowrap"
      p={4}
      data-testid="v2-zoom-controls"
      style={{
        position: "absolute",
        right: 18,
        bottom: 18,
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
        aria-label={t("pdfTextEditorV2.zoom.out", "Zoom out")}
        data-testid="v2-zoom-out"
        onClick={() => zoomTo(renderScale - Z_STEP)}
      >
        −
      </Button>
      {/* The readout doubles as the reset control: a separate "100%" button
          beside a "150%" readout read as two zoom values. */}
      <Tooltip label={t("pdfTextEditorV2.zoom.reset", "Reset zoom to 100%")}>
        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          data-testid="v2-zoom-reset"
          onClick={() => store.setRenderScale(1)}
        >
          <Text size="xs" miw={38} ta="center" data-testid="v2-zoom-percent">
            {Math.round(renderScale * 100)}%
          </Text>
        </Button>
      </Tooltip>
      <Button
        size="sm"
        variant="tertiary"
        accent="neutral"
        aria-label={t("pdfTextEditorV2.zoom.in", "Zoom in")}
        data-testid="v2-zoom-in"
        onClick={() => zoomTo(renderScale + Z_STEP)}
      >
        +
      </Button>
      <Button
        size="sm"
        variant="tertiary"
        accent="neutral"
        aria-label={t("pdfTextEditorV2.zoom.fitToWidth", "Fit to width")}
        data-testid="v2-zoom-fit"
        onClick={() => {
          const stage = document.querySelector<HTMLElement>(
            '[data-testid="v2-stage"]',
          );
          const firstPage = pages[0];
          if (!stage || !firstPage) return;
          const available = stage.clientWidth - FIT_PAD_PX;
          zoomTo(available / Math.max(1, firstPage.width));
        }}
      >
        {t("pdfTextEditorV2.zoom.fit", "Fit")}
      </Button>
    </Group>
  );
}
