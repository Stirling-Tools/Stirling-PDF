import { Box, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useAllFiles } from "@app/contexts/FileContext";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import type { ToolScopeSwitchProps } from "@core/components/tools/shared/ToolScopeSwitch";

export type { ToolScopeSwitchProps };

type Scope = "file" | "all";

/**
 * Tools follow the workbench: the viewer scopes them to the file on screen,
 * Active Files to every open file. On a phone that switch is a screen away, so
 * it sits beside the run button and flips the workbench for you.
 */
export function ToolScopeSwitch({ disabled }: ToolScopeSwitchProps) {
  const { t } = useTranslation();
  const { files } = useAllFiles();
  const { workbench } = useNavigationState();
  const { actions } = useNavigationActions();

  if (files.length < 2) return null;

  const scope: Scope = workbench === "viewer" ? "file" : "all";

  return (
    <Box mx="md" mb="xs">
      <Text size="xs" c="dimmed" mb={4}>
        {t("mobile.scope.label", "Apply to")}
      </Text>
      <SegmentedControl<Scope>
        fullWidth
        disabled={disabled}
        ariaLabel={t("mobile.scope.label", "Apply to")}
        value={scope}
        onChange={(next) =>
          actions.setWorkbench(next === "file" ? "viewer" : "fileEditor")
        }
        options={[
          { value: "file", label: t("mobile.scope.thisFile", "This file") },
          {
            value: "all",
            label: t("mobile.scope.allFiles", "All files ({{count}})", {
              count: files.length,
            }),
          },
        ]}
      />
    </Box>
  );
}
