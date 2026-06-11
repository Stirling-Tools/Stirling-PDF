import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Loader } from "@mantine/core";
import { ToggleSwitch } from "@shared/components/ToggleSwitch";
import { Card } from "@shared/components/Card";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { PolicyRedactConfig } from "@app/components/policies/PolicyRedactConfig";
import { PolicyWatermarkConfig } from "@app/components/policies/PolicyWatermarkConfig";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";

/**
 * Plain-language, non-technical descriptions shown by each tool's info button.
 * Stored as [i18n key, English default] pairs so they can be resolved with `t`
 * at render (the map lives at module scope, outside the component).
 */
const TOOL_PLAIN_INFO: Record<string, readonly [key: string, en: string]> = {
  redact: [
    "policies.toolConfig.info.redact",
    "Automatically finds and blacks out sensitive details — like Social Security and card numbers — so they can't be read in the document.",
  ],
  sanitize: [
    "policies.toolConfig.info.sanitize",
    "Removes hidden JavaScript from the file, so nothing can run automatically when someone opens it.",
  ],
  watermark: [
    "policies.toolConfig.info.watermark",
    "Stamps a visible mark (e.g. “Confidential”) across every page.",
  ],
};

/** One tool in a policy's fixed chain: whether it runs + its configured params. */
export interface PolicyToolState {
  /** Frontend tool-registry id (also the registry key + the thing we map to an endpoint). */
  operation: string;
  /** Whether this tool runs as part of the policy (the per-tool on/off). */
  enabled: boolean;
  /** Tool-specific parameters (the shape its endpoint accepts). */
  parameters: Record<string, unknown>;
}

interface PolicyToolConfigProps {
  /** The policy's fixed tool chain — locked (no add/remove), only configurable. */
  tools: PolicyToolState[];
  toolRegistry: Partial<ToolRegistry>;
  onChange: (tools: PolicyToolState[]) => void;
  /** Read-only when the policy is managed / the user can't configure. */
  editable?: boolean;
}

/**
 * Locked, configure-only tool panel for a policy. The chain is fixed (you can't
 * add or remove tools); each tool is a section that renders its OWN settings form
 * from the tool registry (`automationSettings`) — the same forms the automation
 * builder uses — so the config is generated from the tools in the workflow, not
 * hardcoded per policy. The parameters produced here are exactly what the backend
 * engine POSTs to each tool's endpoint.
 */
export function PolicyToolConfig({
  tools,
  toolRegistry,
  onChange,
  editable = true,
}: PolicyToolConfigProps) {
  const { t } = useTranslation();
  const patchTool = (index: number, patch: Partial<PolicyToolState>) =>
    onChange(tools.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  return (
    <div className="pol-tool-config">
      {tools.map((tool, index) => {
        const entry = toolRegistry[tool.operation as ToolId];
        const Settings = entry?.automationSettings ?? null;
        const toolName = entry?.name ?? tool.operation;
        const plainInfo = TOOL_PLAIN_INFO[tool.operation];
        return (
          <Card key={tool.operation} padding="none">
            <div className="pol-tool-head">
              <span className="pol-tool-icon">{entry?.icon}</span>
              <span className="pol-tool-name">{toolName}</span>
              {plainInfo && (
                <AppTooltip
                  content={t(plainInfo[0], plainInfo[1])}
                  sidebarTooltip
                  pinOnClick
                >
                  <button
                    type="button"
                    className="pol-info-btn"
                    aria-label={t(
                      "policies.toolConfig.infoAriaLabel",
                      "What does {{tool}} do?",
                      { tool: toolName },
                    )}
                  >
                    <LocalIcon
                      icon="info-outline-rounded"
                      width="1rem"
                      height="1rem"
                      style={{ color: "var(--icon-files-color)" }}
                    />
                  </button>
                </AppTooltip>
              )}
              <ToggleSwitch
                size="sm"
                checked={tool.enabled}
                disabled={!editable}
                onChange={(checked) => patchTool(index, { enabled: checked })}
                aria-label={t(
                  "policies.toolConfig.enableAriaLabel",
                  "Enable {{tool}}",
                  {
                    tool: toolName,
                  },
                )}
              />
            </div>
            {tool.enabled &&
              (tool.operation === "redact" ? (
                <div className="pol-tool-body">
                  <PolicyRedactConfig
                    parameters={tool.parameters}
                    onChange={(parameters) => patchTool(index, { parameters })}
                    disabled={!editable}
                  />
                </div>
              ) : tool.operation === "sanitize" ? (
                // Sanitize is config-less: it only removes JavaScript (params
                // are fixed in the policy preset), so no settings are shown.
                <></>
              ) : tool.operation === "watermark" ? (
                // Watermark settings with flatten hidden + forced on (see
                // PolicyWatermarkConfig).
                <div className="pol-tool-body">
                  <PolicyWatermarkConfig
                    parameters={tool.parameters}
                    onChange={(parameters) => patchTool(index, { parameters })}
                    disabled={!editable}
                  />
                </div>
              ) : Settings ? (
                <div className="pol-tool-body">
                  <Suspense fallback={<Loader size="sm" />}>
                    <Settings
                      parameters={tool.parameters}
                      onParameterChange={(key: string, value: unknown) =>
                        patchTool(index, {
                          parameters: { ...tool.parameters, [key]: value },
                        })
                      }
                      disabled={!editable}
                    />
                  </Suspense>
                </div>
              ) : null)}
          </Card>
        );
      })}
    </div>
  );
}
