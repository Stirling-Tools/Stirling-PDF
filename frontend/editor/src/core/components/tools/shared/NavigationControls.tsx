import { Stack, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { ActionIcon } from "@app/ui/ActionIcon";

export interface NavigationControlsProps {
  currentIndex: number;
  totalFiles: number;
  onPrevious: () => void;
  onNext: () => void;
}

const NavigationControls = ({
  currentIndex,
  totalFiles,
  onPrevious,
  onNext,
}: NavigationControlsProps) => {
  const { t } = useTranslation();
  if (totalFiles <= 1) return null;

  return (
    <Stack align="center" gap="xs" mt="xs">
      <Group justify="center" gap="xs">
        <ActionIcon
          aria-label={t("common.previous", "Previous")}
          variant="secondary"
          size="sm"
          onClick={onPrevious}
          disabled={totalFiles <= 1}
          data-testid="review-panel-prev"
        >
          <ChevronLeftIcon style={{ fontSize: "1rem" }} />
        </ActionIcon>
        <Text size="xs" c="dimmed">
          {currentIndex + 1} of {totalFiles}
        </Text>

        <ActionIcon
          aria-label={t("common.next", "Next")}
          variant="secondary"
          size="sm"
          onClick={onNext}
          disabled={totalFiles <= 1}
          data-testid="review-panel-next"
        >
          <ChevronRightIcon style={{ fontSize: "1rem" }} />
        </ActionIcon>
      </Group>
    </Stack>
  );
};

export default NavigationControls;
