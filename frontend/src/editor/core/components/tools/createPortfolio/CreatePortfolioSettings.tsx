/**
 * CreatePortfolioSettings - Shared settings component for both tool UI and automation
 *
 * Bundles the selected files into an Adobe PDF Portfolio behind a cover page.
 */
import { Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CreatePortfolioParameters } from "@editor/hooks/tools/createPortfolio/useCreatePortfolioParameters";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface CreatePortfolioSettingsProps {
  parameters: CreatePortfolioParameters;
  onParameterChange: <K extends keyof CreatePortfolioParameters>(
    key: K,
    value: CreatePortfolioParameters[K],
  ) => void;
  disabled?: boolean;
}

const CreatePortfolioSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: CreatePortfolioSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <TextInput
        {...infoLabelProps(
          t("createPortfolio.coverTitle", "Cover page title"),
          t(
            "createPortfolio.coverTitleInfo",
            "The heading on the cover page that readers without portfolio support open to.",
          ),
        )}
        placeholder={t(
          "createPortfolio.coverTitlePlaceholder",
          "PDF Portfolio",
        )}
        value={parameters.coverTitle}
        className={privateContentClassName}
        onChange={(event) =>
          onParameterChange("coverTitle", event.currentTarget.value)
        }
        disabled={disabled}
      />
    </Stack>
  );
};

export default CreatePortfolioSettings;
