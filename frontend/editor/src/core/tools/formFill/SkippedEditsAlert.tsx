/**
 * Reports the edits the backend could not apply after a commit.
 *
 * The mutating endpoints return the updated PDF, so partial failures travel back
 * in a response header rather than the body. Without this the UI would report a
 * plain success while quietly dropping a field.
 */
import { Alert, List, Text } from "@mantine/core";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTranslation } from "react-i18next";
import { useFormFill } from "@app/tools/formFill/FormFillContext";

export function SkippedEditsAlert() {
  const { t } = useTranslation();
  const { skippedEdits, clearSkippedEdits } = useFormFill();

  if (skippedEdits.length === 0) return null;

  return (
    <Alert
      icon={<WarningAmberIcon sx={{ fontSize: 16 }} />}
      color="yellow"
      variant="light"
      p="xs"
      radius="sm"
      withCloseButton
      onClose={clearSkippedEdits}
      data-testid="form-skipped-edits"
    >
      <Text size="xs" fw={600}>
        {t("formFill.skippedEdits", {
          count: skippedEdits.length,
          defaultValue: "{{count}} changes could not be applied:",
        })}
      </Text>
      <List size="xs" spacing={2} mt={4}>
        {skippedEdits.map((skip, index) => (
          <List.Item key={`${skip.operation}-${skip.target ?? index}`}>
            <Text size="xs">
              {skip.target ? `${skip.target}: ` : ""}
              {skip.reason}
            </Text>
          </List.Item>
        ))}
      </List>
    </Alert>
  );
}

export default SkippedEditsAlert;
