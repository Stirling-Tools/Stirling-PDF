import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import {
  useToolWorkflowActions,
  useToolWorkflowData,
} from "@editor/contexts/ToolWorkflowContext";
import {
  getToolDisabledReason,
  resolveDisabledMessage,
} from "@editor/components/tools/fullscreen/shared";
import styles from "@editor/tools/formFill/FormFill.module.css";
import "@editor/ui/accents.css";

/**
 * Sends the user from the form editor to Auto Form Detection. Shown even when that
 * tool is unavailable, disabled with the same reason the tool list gives, so the
 * feature stays discoverable.
 */
export function AutoDetectFieldsCta() {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { toolRegistry, toolAvailability } = useToolWorkflowData();
  const { handleToolSelect } = useToolWorkflowActions();
  const tool = toolRegistry.autoFormDetection;
  if (!tool) return null;

  const disabledReason = getToolDisabledReason(
    "autoFormDetection",
    tool,
    toolAvailability,
    config?.premiumEnabled,
  );

  const button = (
    <Button
      accent="ai"
      size="sm"
      leftSection={<Icon name="sparkles" size={16} />}
      disabled={disabledReason !== null}
      onClick={() => handleToolSelect("autoFormDetection")}
    >
      {t("formFill.autoDetect.action", "Auto-detect fields")}
    </Button>
  );

  return (
    <div className={`sui-acc-ai ${styles.autoDetectCta}`}>
      <span className={styles.autoDetectIcon}>
        <Icon name="form-scan" size={20} />
      </span>
      <div className={styles.autoDetectText}>
        <span className={styles.autoDetectTitle}>
          {t("formFill.autoDetect.title", "Find fields with AI")}
        </span>
        <span className={styles.autoDetectBody}>
          {t(
            "formFill.autoDetect.body",
            "Detect the form fields in this PDF automatically instead of drawing them by hand.",
          )}
        </span>
      </div>
      {disabledReason === null ? (
        button
      ) : (
        <Tooltip
          content={
            <span>
              <strong>{resolveDisabledMessage(t, disabledReason, tool)}</strong>{" "}
              {tool.description}
            </span>
          }
          position="top"
          arrow
        >
          <span>{button}</span>
        </Tooltip>
      )}
    </div>
  );
}
