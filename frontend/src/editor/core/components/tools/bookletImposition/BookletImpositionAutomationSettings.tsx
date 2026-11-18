import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { BookletImpositionParameters } from "@editor/hooks/tools/bookletImposition/useBookletImpositionParameters";
import BookletImpositionSettings from "@editor/components/tools/bookletImposition/BookletImpositionSettings";
import BookletImpositionAdvancedSettings from "@editor/components/tools/bookletImposition/BookletImpositionAdvancedSettings";

interface BookletImpositionAutomationSettingsProps {
  parameters: BookletImpositionParameters;
  onParameterChange: <K extends keyof BookletImpositionParameters>(
    key: K,
    value: BookletImpositionParameters[K],
  ) => void;
  disabled?: boolean;
}

/** Both booklet steps in one view, for Automate and pipelines, which render a single settings panel. */
const BookletImpositionAutomationSettings = (
  props: BookletImpositionAutomationSettingsProps,
) => {
  const { t } = useTranslation();

  return (
    <Stack gap="lg">
      <BookletImpositionSettings {...props} />
      <Stack gap="md">
        <Text size="sm" fw={600}>
          {t("bookletImposition.advanced.title", "Advanced")}
        </Text>
        <BookletImpositionAdvancedSettings {...props} />
      </Stack>
    </Stack>
  );
};

export default BookletImpositionAutomationSettings;
