import {
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SPLIT_MODE_OPTIONS } from "@app/components/tools/cutAndTile/cutAndTileConstants";
import {
  MAX_GRID_DIVISIONS,
  MAX_POSTER_DIVISIONS,
  PAPER_SIZES,
  type CutAndTileParameters,
} from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

export interface CutAndTileSettingsProps {
  parameters: CutAndTileParameters;
  onParameterChange: <K extends keyof CutAndTileParameters>(
    key: K,
    value: CutAndTileParameters[K],
  ) => void;
  disabled?: boolean;
}

const toText = (value: string | number): string =>
  value === "" ? "" : String(value);

const CutAndTileSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: CutAndTileSettingsProps): ReactNode => {
  const { t } = useTranslation();

  if (parameters.mode === "poster") {
    return (
      <Stack gap="sm">
        <Select
          label={t("cutAndTile.poster.pageSize", "Paper size")}
          description={t(
            "cutAndTile.poster.pageSizeHint",
            "Each tile is scaled to fit this size.",
          )}
          value={parameters.pageSize || "A4"}
          onChange={(value) => onParameterChange("pageSize", value || "A4")}
          data={PAPER_SIZES.map((size) => ({
            value: size,
            label: t(`cutAndTile.poster.sizes.${size.toLowerCase()}`, size),
          }))}
          disabled={disabled}
          data-testid="cut-and-tile-poster-size"
          comboboxProps={{
            withinPortal: true,
            zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
          }}
        />
        <Group grow gap="sm" align="flex-start">
          <NumberInput
            label={t("cutAndTile.poster.columns", "Tiles across")}
            value={parameters.tileColumns}
            onChange={(value) =>
              onParameterChange("tileColumns", toText(value))
            }
            min={1}
            max={MAX_POSTER_DIVISIONS}
            allowDecimal={false}
            clampBehavior="strict"
            disabled={disabled}
            data-testid="cut-and-tile-tile-columns"
          />
          <NumberInput
            label={t("cutAndTile.poster.rows", "Tiles down")}
            value={parameters.tileRows}
            onChange={(value) => onParameterChange("tileRows", toText(value))}
            min={1}
            max={MAX_POSTER_DIVISIONS}
            allowDecimal={false}
            clampBehavior="strict"
            disabled={disabled}
            data-testid="cut-and-tile-tile-rows"
          />
        </Group>
        <Switch
          label={t("cutAndTile.poster.rightToLeft", "Right-to-left order")}
          description={t(
            "cutAndTile.poster.rightToLeftHint",
            "Number the tiles right to left, for RTL layouts.",
          )}
          checked={parameters.rightToLeft}
          onChange={(e) =>
            onParameterChange("rightToLeft", e.currentTarget.checked)
          }
          disabled={disabled}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Group grow gap="sm" align="flex-start">
        <NumberInput
          label={t("cutAndTile.grid.rows", "Rows")}
          value={parameters.rows}
          onChange={(value) => onParameterChange("rows", toText(value))}
          min={1}
          max={MAX_GRID_DIVISIONS}
          allowDecimal={false}
          clampBehavior="strict"
          disabled={disabled}
          data-testid="cut-and-tile-rows"
        />
        <NumberInput
          label={t("cutAndTile.grid.columns", "Columns")}
          value={parameters.columns}
          onChange={(value) => onParameterChange("columns", toText(value))}
          min={1}
          max={MAX_GRID_DIVISIONS}
          allowDecimal={false}
          clampBehavior="strict"
          disabled={disabled}
          data-testid="cut-and-tile-columns"
        />
      </Group>

      <Select
        label={t("cutAndTile.grid.pages", "Pages to cut")}
        description={
          parameters.assemble
            ? t(
                "cutAndTile.grid.pagesHintAssembled",
                "Unselected pages stay whole inside the same PDF.",
              )
            : t(
                "cutAndTile.grid.pagesHint",
                "Unselected pages stay whole, each in its own PDF.",
              )
        }
        value={parameters.cutPages}
        onChange={(value) =>
          onParameterChange(
            "cutPages",
            (value || "all") as CutAndTileParameters["cutPages"],
          )
        }
        data={SPLIT_MODE_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        disabled={disabled}
        data-testid="cut-and-tile-pages"
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      {parameters.cutPages === "custom" && (
        <TextInput
          label={t("cutAndTile.grid.customPages", "Page numbers")}
          placeholder={t("cutAndTile.grid.customPagesPlaceholder", "2, 4, 6-8")}
          value={parameters.customPages}
          onChange={(e) => onParameterChange("customPages", e.target.value)}
          disabled={disabled}
          data-testid="cut-and-tile-custom-pages"
        />
      )}

      <Switch
        label={t("cutAndTile.grid.assemble", "Keep all pieces in one PDF")}
        description={t(
          "cutAndTile.grid.assembleHint",
          "The pieces and the untouched pages become pages of one file.",
        )}
        checked={parameters.assemble}
        onChange={(e) => onParameterChange("assemble", e.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default CutAndTileSettings;
