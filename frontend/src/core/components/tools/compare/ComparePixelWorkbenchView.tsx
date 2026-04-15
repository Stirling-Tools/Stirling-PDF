import { useMemo, useState } from "react";
import { Badge, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { CompareResultPixelData, ComparePixelPageResult } from "@app/types/compare";
import "@app/components/tools/compare/compareView.css";

interface ComparePixelWorkbenchViewProps {
  result: CompareResultPixelData;
}

type PixelViewMode = "side-by-side" | "diff-only" | "overlay";

const formatPercent = (ratio: number): string => {
  if (!Number.isFinite(ratio) || ratio <= 0) return "0%";
  if (ratio < 0.0001) return "<0.01%";
  return `${(ratio * 100).toFixed(2)}%`;
};

const PixelPageCard = ({ page, viewMode, t }: { page: ComparePixelPageResult; viewMode: PixelViewMode; t: TFunction }) => {
  const aspectRatio = `${page.width} / ${page.height}`;

  return (
    <Stack gap="xs" className="compare-pixel-page">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600}>
          {t("compare.pixel.pageLabel", "Page")} {page.pageNumber}
        </Text>
        <Group gap="xs">
          {page.missingBase && (
            <Badge size="xs" color="red" variant="light">
              {t("compare.pixel.missingInBase", "Missing in original")}
            </Badge>
          )}
          {page.missingComparison && (
            <Badge size="xs" color="red" variant="light">
              {t("compare.pixel.missingInComparison", "Missing in edited")}
            </Badge>
          )}
          {page.sizeMismatch && (
            <Badge size="xs" color="yellow" variant="light">
              {t("compare.pixel.sizeMismatch", "Size mismatch")}
            </Badge>
          )}
          <Badge size="xs" color={page.diffPixels > 0 ? "red" : "green"} variant="light">
            {formatPercent(page.diffRatio)} {t("compare.pixel.changed", "changed")}
          </Badge>
        </Group>
      </Group>

      {viewMode === "side-by-side" && (
        <div className="compare-pixel-triptych">
          <figure>
            <img
              src={page.baseImageUrl}
              alt={t("compare.pixel.base", "Original")}
              loading="lazy"
              decoding="async"
              style={{ aspectRatio, width: "100%" }}
            />
            <figcaption>{t("compare.pixel.base", "Original")}</figcaption>
          </figure>
          <figure>
            <img
              src={page.diffImageUrl}
              alt={t("compare.pixel.diff", "Differences")}
              loading="lazy"
              decoding="async"
              style={{ aspectRatio, width: "100%" }}
            />
            <figcaption>{t("compare.pixel.diff", "Differences")}</figcaption>
          </figure>
          <figure>
            <img
              src={page.comparisonImageUrl}
              alt={t("compare.pixel.comparison", "Edited")}
              loading="lazy"
              decoding="async"
              style={{ aspectRatio, width: "100%" }}
            />
            <figcaption>{t("compare.pixel.comparison", "Edited")}</figcaption>
          </figure>
        </div>
      )}

      {viewMode === "diff-only" && (
        <figure>
          <img
            src={page.diffImageUrl}
            alt={t("compare.pixel.diff", "Differences")}
            loading="lazy"
            decoding="async"
            style={{ aspectRatio, width: "100%" }}
          />
        </figure>
      )}

      {viewMode === "overlay" && (
        <div className="compare-pixel-overlay" style={{ aspectRatio }}>
          <img
            src={page.baseImageUrl}
            alt={t("compare.pixel.base", "Original")}
            loading="lazy"
            decoding="async"
            className="compare-pixel-overlay-img"
          />
          <img
            src={page.diffImageUrl}
            alt={t("compare.pixel.diff", "Differences")}
            loading="lazy"
            decoding="async"
            className="compare-pixel-overlay-img compare-pixel-overlay-top"
          />
        </div>
      )}
    </Stack>
  );
};

const ComparePixelWorkbenchView = ({ result }: ComparePixelWorkbenchViewProps) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<PixelViewMode>("side-by-side");

  const totalPercent = useMemo(() => formatPercent(result.totals.diffRatio), [result.totals.diffRatio]);

  return (
    <Stack className="compare-workbench compare-pixel-workbench" gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Group gap="md">
          <Text fw={600}>{t("compare.pixel.summaryTitle", "Pixel comparison")}</Text>
          <Badge color={result.totals.diffPixels > 0 ? "red" : "green"} variant="light">
            {totalPercent} {t("compare.pixel.overall", "overall")}
          </Badge>
          <Badge color="blue" variant="light">
            {result.totals.pagesWithChanges}/{result.pages.length} {t("compare.pixel.pagesChanged", "pages changed")}
          </Badge>
          <Badge color="gray" variant="light">
            {result.settings.dpi} DPI
          </Badge>
        </Group>
        <SegmentedControl
          size="xs"
          value={viewMode}
          onChange={(value) => setViewMode(value as PixelViewMode)}
          data={[
            { value: "side-by-side", label: t("compare.pixel.sideBySide", "Side-by-side") },
            { value: "diff-only", label: t("compare.pixel.diffOnly", "Diff only") },
            { value: "overlay", label: t("compare.pixel.overlay", "Overlay") },
          ]}
        />
      </Group>

      {result.warnings.length > 0 && (
        <Stack gap={4}>
          {result.warnings.map((w, i) => (
            <Text key={i} size="xs" c="yellow.7">
              {w}
            </Text>
          ))}
        </Stack>
      )}

      <Stack gap="lg" className="compare-pixel-list">
        {result.pages.map((page) => (
          <PixelPageCard key={page.pageNumber} page={page} viewMode={viewMode} t={t} />
        ))}
      </Stack>
    </Stack>
  );
};

export default ComparePixelWorkbenchView;
