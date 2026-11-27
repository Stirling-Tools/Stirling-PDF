import { Suspense, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Title,
  Group,
  Stack,
  Text,
  Alert,
  Loader,
  Tooltip,
} from "@mantine/core";
import { Button } from "@editor/ui/Button";
import {
  Z_INDEX_AUTOMATE_DROPDOWN,
  Z_INDEX_AUTOMATE_MODAL,
} from "@editor/styles/zIndex";
import { Icon } from "@editor/ui/Icon";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { ToolId } from "@editor/types/toolId";
import { ErasedToolParams } from "@editor/hooks/tools/shared/toolOperationTypes";
import {
  paramsOverDefaults,
  toolParamsNeedConfiguring,
} from "@editor/hooks/tools/shared/toolAutomation";

interface ToolConfigurationModalProps {
  opened: boolean;
  tool: {
    id: string;
    operation: string;
    name: string;
    parameters?: ErasedToolParams;
  };
  onSave: (parameters: ErasedToolParams) => void;
  onCancel: () => void;
  toolRegistry: Partial<ToolRegistry>;
}

export default function ToolConfigurationModal({
  opened,
  tool,
  onSave,
  onCancel,
  toolRegistry,
}: ToolConfigurationModalProps) {
  const { t } = useTranslation();

  const [parameters, setParameters] = useState<ErasedToolParams>({});

  const toolId = tool.operation as ToolId;
  const SettingsComponent = toolRegistry[toolId]?.automationSettings;
  const needsConfiguring = toolParamsNeedConfiguring(
    toolId,
    parameters,
    toolRegistry,
  );

  useEffect(() => {
    setParameters(
      paramsOverDefaults(toolId, tool.parameters ?? {}, toolRegistry),
    );
  }, [tool.parameters, toolId, toolRegistry]);

  // Render the settings component
  const renderToolSettings = () => {
    if (!SettingsComponent) {
      return (
        <Alert icon={<Icon name="triangle-alert" />} color="orange">
          <Text size="sm">
            {t(
              "automate.config.noSettings",
              "This tool does not have configurable settings.",
            )}
          </Text>
        </Alert>
      );
    }

    return (
      <SettingsComponent
        parameters={parameters}
        onParameterChange={(key, value) => {
          setParameters((prev) => ({ ...prev, [key]: value }));
        }}
        disabled={false}
      />
    );
  };

  const handleSave = () => {
    onSave(parameters);
  };

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={
        <Group gap="xs" wrap="nowrap">
          <Icon name="settings" />
          <Title order={3}>
            {t("automate.config.title", "Configure {{toolName}}", {
              toolName: tool.name,
            })}
          </Title>
          <ToolInfoTooltip
            label={t(
              "automate.config.description",
              "Configure the settings for this tool. These settings will be applied when the automation runs.",
            )}
          />
        </Group>
      }
      size="lg"
      centered
      zIndex={Z_INDEX_AUTOMATE_MODAL}
    >
      <Stack gap="md">
        <div
          style={{ maxHeight: "60vh", overflowY: "auto", overflowX: "hidden" }}
        >
          <Suspense fallback={<Loader size="sm" />}>
            {renderToolSettings()}
          </Suspense>
        </div>

        <Group justify="flex-end" gap="sm">
          <Button
            variant="secondary"
            leftSection={<Icon name="x" />}
            onClick={onCancel}
          >
            {t("automate.config.cancel", "Cancel")}
          </Button>
          <Tooltip
            label={t("tool.invalidParams", "Fill in the required settings.")}
            disabled={!needsConfiguring}
            zIndex={Z_INDEX_AUTOMATE_DROPDOWN}
            withArrow
          >
            {/* Wrapper keeps the tooltip reachable while the button is disabled. */}
            <span style={{ display: "inline-flex" }}>
              <Button
                leftSection={<Icon name="check" />}
                onClick={handleSave}
                disabled={needsConfiguring}
              >
                {t("automate.config.save", "Save Configuration")}
              </Button>
            </span>
          </Tooltip>
        </Group>
      </Stack>
    </Modal>
  );
}
