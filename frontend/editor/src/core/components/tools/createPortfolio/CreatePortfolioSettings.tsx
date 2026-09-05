/**
 * CreatePortfolioSettings - Shared settings component for both tool UI and automation
 *
 * Bundles the selected files into an Adobe PDF Portfolio behind a cover page.
 */
import { Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CreatePortfolioParameters } from "@app/hooks/tools/createPortfolio/useCreatePortfolioParameters";

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
        label={t("createPortfolio.coverTitle", "Cover page title")}
        placeholder={t(
          "createPortfolio.coverTitlePlaceholder",
          "PDF Portfolio",
        )}
        value={parameters.coverTitle}
        onChange={(event) =>
          onParameterChange("coverTitle", event.currentTarget.value)
        }
        disabled={disabled}
      />
      <Text size="xs" c="dimmed">
        {t(
          "createPortfolio.description",
          "Every selected file is kept whole inside the new PDF, whatever its type. Readers that don't support portfolios show a cover page with the files attached.",
        )}
      </Text>
    </Stack>
  );
};

export default CreatePortfolioSettings;
