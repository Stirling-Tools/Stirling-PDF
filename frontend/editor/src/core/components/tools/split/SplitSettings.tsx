import {
  Anchor,
  Box,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import type { ReactNode } from "react";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { SPLIT_METHODS } from "@app/constants/splitConstants";
import { SplitParameters } from "@app/hooks/tools/split/useSplitParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

export interface SplitSettingsProps {
  parameters: SplitParameters;
  onParameterChange: <K extends keyof SplitParameters>(
    key: K,
    value: SplitParameters[K],
  ) => void;
  disabled?: boolean;
  /** Goal-level method switch, rendered above the inputs when the goal has more than one. */
  variantPicker?: ReactNode;
}

const PAPER_SIZES = ["A4", "Letter", "A3", "A5", "Legal", "Tabloid"] as const;

const SplitSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  variantPicker,
}: SplitSettingsProps) => {
  const { t } = useTranslation();

  // Divisions are cut lines; people count rows and columns, so show that.
  // An empty field stays empty so it can be retyped — validation blocks the run.
  const rows =
    parameters.hDiv === "" ? "" : (toPositiveInt(parameters.hDiv) ?? 2);
  const columns =
    parameters.vDiv === "" ? "" : (toPositiveInt(parameters.vDiv) ?? 2);
  const setDivisions = (key: "hDiv" | "vDiv", next: string) => {
    if (next.trim() === "") {
      onParameterChange(key, "");
      return;
    }
    const count = Number(next);
    if (!Number.isFinite(count)) return;
    onParameterChange(key, String(Math.max(1, Math.round(count)) - 1));
  };

  const renderByPagesForm = () => (
    <TextInput
      label={t("split.byPages.label", "Pages to break after")}
      placeholder={t("split.byPages.placeholder", "1, 3, 7-10")}
      description={t(
        "split.byPages.description",
        "Each number cuts after that page. A range cuts after every page in it.",
      )}
      value={parameters.pages}
      onChange={(e) => onParameterChange("pages", e.target.value)}
      disabled={disabled}
      data-testid="split-pages-input"
    />
  );

  const renderBySectionsForm = () => (
    <Stack gap="sm">
      <Group grow gap="sm" align="flex-start">
        <NumberInput
          label={t("split.bySections.rows", "Rows")}
          value={rows}
          onChange={(value) => setDivisions("hDiv", String(value))}
          min={1}
          max={100}
          allowDecimal={false}
          clampBehavior="strict"
          disabled={disabled}
          data-testid="split-sections-rows"
        />
        <NumberInput
          label={t("split.bySections.columns", "Columns")}
          value={columns}
          onChange={(value) => setDivisions("vDiv", String(value))}
          min={1}
          max={100}
          allowDecimal={false}
          clampBehavior="strict"
          disabled={disabled}
          data-testid="split-sections-columns"
        />
      </Group>

      <Select
        label={t("split.bySections.pagesLabel", "Pages to cut")}
        description={t(
          "split.bySections.pagesDescription",
          "Pages you leave alone are kept whole, one file each.",
        )}
        value={parameters.splitMode || "SPLIT_ALL"}
        onChange={(value) =>
          onParameterChange("splitMode", value || "SPLIT_ALL")
        }
        data={[
          {
            value: "SPLIT_ALL",
            label: t("split.bySections.pages.all", "Every page"),
          },
          {
            value: "SPLIT_ALL_EXCEPT_FIRST",
            label: t(
              "split.bySections.pages.exceptFirst",
              "All except the first",
            ),
          },
          {
            value: "SPLIT_ALL_EXCEPT_LAST",
            label: t(
              "split.bySections.pages.exceptLast",
              "All except the last",
            ),
          },
          {
            value: "SPLIT_ALL_EXCEPT_FIRST_AND_LAST",
            label: t(
              "split.bySections.pages.exceptFirstAndLast",
              "All except the first and last",
            ),
          },
          {
            value: "CUSTOM",
            label: t("split.bySections.pages.custom", "Only these pages"),
          },
        ]}
        disabled={disabled}
        data-testid="split-sections-pages"
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      {parameters.splitMode === "CUSTOM" && (
        <TextInput
          label={t("split.bySections.customPages", "Page numbers")}
          placeholder={t(
            "split.bySections.customPagesPlaceholder",
            "2, 4, 6-8",
          )}
          value={parameters.customPages || ""}
          onChange={(e) => onParameterChange("customPages", e.target.value)}
          disabled={disabled}
          data-testid="split-sections-custom-pages"
        />
      )}

      <Switch
        label={t("split.bySections.merge", "Reassemble into one PDF")}
        description={t(
          "split.bySections.mergeDescription",
          "Cut pages become their sections; everything else keeps its page.",
        )}
        checked={parameters.merge}
        onChange={(e) => onParameterChange("merge", e.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );

  const renderSplitValueForm = () => {
    if (parameters.method === SPLIT_METHODS.BY_SIZE) {
      return (
        <TextInput
          label={t("split.bySize.label", "Maximum file size")}
          placeholder={t("split.bySize.placeholder", "10 MB")}
          description={t(
            "split.bySize.description",
            "Use KB, MB or GB. The splitter picks the breaks that keep each file under it.",
          )}
          value={parameters.splitValue}
          onChange={(e) => onParameterChange("splitValue", e.target.value)}
          disabled={disabled}
          data-testid="split-size-input"
        />
      );
    }

    const isDocCount = parameters.method === SPLIT_METHODS.BY_DOC_COUNT;
    return (
      <NumberInput
        label={
          isDocCount
            ? t("split.byDocCount.label", "Number of files")
            : t("split.byPageCount.label", "Pages per file")
        }
        description={
          isDocCount
            ? undefined
            : t(
                "split.byPageCount.description",
                "The last file may hold fewer.",
              )
        }
        placeholder={isDocCount ? "3" : "5"}
        value={parameters.splitValue}
        onChange={(value) => onParameterChange("splitValue", String(value))}
        min={1}
        max={10000}
        allowDecimal={false}
        clampBehavior="strict"
        disabled={disabled}
        data-testid={
          isDocCount ? "split-doc-count-input" : "split-page-count-input"
        }
      />
    );
  };

  const renderByChaptersForm = () => (
    <Stack gap="sm">
      <NumberInput
        label={t("split.byChapters.level", "Bookmark level")}
        description={t(
          "split.byChapters.levelDescription",
          "1 is the top of the outline; higher numbers split on nested entries.",
        )}
        value={parameters.bookmarkLevel}
        onChange={(value) => onParameterChange("bookmarkLevel", String(value))}
        min={1}
        max={10}
        allowDecimal={false}
        clampBehavior="strict"
        disabled={disabled}
        data-testid="split-chapters-level"
      />
      <Switch
        label={t("split.byChapters.includeMetadata", "Keep document metadata")}
        checked={parameters.includeMetadata}
        onChange={(e) =>
          onParameterChange("includeMetadata", e.currentTarget.checked)
        }
        disabled={disabled}
      />
      <Switch
        label={t(
          "split.byChapters.allowDuplicates",
          "Allow duplicate bookmark names",
        )}
        checked={parameters.allowDuplicates}
        onChange={(e) =>
          onParameterChange("allowDuplicates", e.currentTarget.checked)
        }
        disabled={disabled}
      />
    </Stack>
  );

  const renderByPageDividerForm = () => (
    <Stack gap="sm">
      <Text size="xs" c="dimmed" lh={1.45}>
        {t(
          "split.byDivider.description",
          "Print the divider sheet, put one between each document, then scan everything in one go. Every divider starts a new file and is removed from it.",
        )}
      </Text>
      <Anchor
        href="https://stirlingpdf.io/files/Auto%20Splitter%20Divider%20(with%20instructions).pdf"
        target="_blank"
        rel="noreferrer"
        size="xs"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
        }}
      >
        <Icon name="download" size="0.9375rem" />
        {t("split.byDivider.download", "Get the divider sheet")}
      </Anchor>
      <Switch
        label={t("split.byDivider.duplex", "Duplex scanning")}
        description={t(
          "split.byDivider.duplexDescription",
          "Scan both sides of the divider sheets.",
        )}
        checked={parameters.duplexMode}
        onChange={(e) =>
          onParameterChange("duplexMode", e.currentTarget.checked)
        }
        disabled={disabled}
      />
    </Stack>
  );

  const renderByPosterForm = () => (
    <Stack gap="sm">
      <Select
        label={t("split.byPoster.pageSize", "Paper size")}
        description={t(
          "split.byPoster.pageSizeDescription",
          "Each tile is scaled to fit this size.",
        )}
        value={parameters.pageSize || "A4"}
        onChange={(value) => onParameterChange("pageSize", value || "A4")}
        data={PAPER_SIZES.map((size) => ({
          value: size,
          label: t(`split.byPoster.sizes.${size.toLowerCase()}`, size),
        }))}
        disabled={disabled}
        data-testid="split-poster-size"
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />
      <Group grow gap="sm" align="flex-start">
        <NumberInput
          label={t("split.byPoster.columns", "Tiles across")}
          value={parameters.xFactor || "2"}
          onChange={(value) => onParameterChange("xFactor", String(value))}
          min={1}
          max={10}
          allowDecimal={false}
          clampBehavior="strict"
          disabled={disabled}
          data-testid="split-poster-columns"
        />
        <NumberInput
          label={t("split.byPoster.rows", "Tiles down")}
          value={parameters.yFactor || "2"}
          onChange={(value) => onParameterChange("yFactor", String(value))}
          min={1}
          max={10}
          allowDecimal={false}
          clampBehavior="strict"
          disabled={disabled}
          data-testid="split-poster-rows"
        />
      </Group>
      <Switch
        label={t("split.byPoster.rightToLeft", "Right-to-left order")}
        description={t(
          "split.byPoster.rightToLeftDescription",
          "Number the tiles right to left, for RTL layouts.",
        )}
        checked={parameters.rightToLeft || false}
        onChange={(e) =>
          onParameterChange("rightToLeft", e.currentTarget.checked)
        }
        disabled={disabled}
      />
    </Stack>
  );

  // Nothing to configure until a goal is picked.
  if (!parameters.method) {
    return (
      <Box py="xs">
        <Text size="xs" c="dimmed" ta="center">
          {t(
            "split.settings.selectMethodFirst",
            "Pick a way to split above to see its settings.",
          )}
        </Text>
      </Box>
    );
  }

  return (
    <Stack gap="md">
      {variantPicker}
      {parameters.method === SPLIT_METHODS.BY_PAGES && renderByPagesForm()}
      {parameters.method === SPLIT_METHODS.BY_SECTIONS &&
        renderBySectionsForm()}
      {(parameters.method === SPLIT_METHODS.BY_SIZE ||
        parameters.method === SPLIT_METHODS.BY_PAGE_COUNT ||
        parameters.method === SPLIT_METHODS.BY_DOC_COUNT) &&
        renderSplitValueForm()}
      {parameters.method === SPLIT_METHODS.BY_CHAPTERS &&
        renderByChaptersForm()}
      {parameters.method === SPLIT_METHODS.BY_PAGE_DIVIDER &&
        renderByPageDividerForm()}
      {parameters.method === SPLIT_METHODS.BY_POSTER && renderByPosterForm()}
    </Stack>
  );
};

function toPositiveInt(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed > 0 ? parsed : null;
}

export default SplitSettings;
