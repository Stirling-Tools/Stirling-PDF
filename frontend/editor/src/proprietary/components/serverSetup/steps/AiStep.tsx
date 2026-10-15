import { useTranslation } from "react-i18next";
import { FormField } from "@app/ui/FormField";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { Select } from "@app/ui/Select";
import {
  OnOffControl,
  sectionToggle,
  SETUP_DROPDOWN,
  SettingRow,
  TextField,
  type SetupStepProps,
} from "@app/components/serverSetup/SetupFields";
import {
  aiProviderChange,
  providerNeedsBaseUrl,
  type AiChoice,
  type AiProvider,
  type McpAuthMode,
} from "@app/components/serverSetup/serverSetupDraft";

export function AiStep(props: SetupStepProps) {
  const { draft, initial, update, errors, mode, setOpenSection } = props;
  const { t } = useTranslation();
  const label = t("serverSetup.ai.label", "AI");
  const mcpLabel = t("serverSetup.mcp.label", "MCP server");
  const choices: { value: AiChoice; label: string }[] = [
    { value: "off", label: t("serverSetup.off", "Off") },
    { value: "custom", label: t("serverSetup.ai.custom", "Your own AI") },
  ];
  // Stirling AI cannot be set up from here yet; keep it selectable only on a
  // server that already uses it, so the wizard never switches it off by accident.
  if (initial.ai === "stirling") {
    choices.push({
      value: "stirling",
      label: t("serverSetup.ai.stirling", "Stirling AI"),
    });
  }
  const providers: { value: AiProvider; label: string }[] = [
    { value: "anthropic", label: "Anthropic" },
    { value: "openai", label: "OpenAI" },
    { value: "ollama", label: "Ollama" },
    {
      value: "custom",
      label: t("serverSetup.ai.providerCustom", "OpenAI-compatible"),
    },
  ];

  return (
    <>
      <SettingRow
        label={label}
        expand={draft.ai === "custom" ? sectionToggle(props, "ai") : undefined}
        details={
          <>
            <TextField
              required
              type="url"
              label={t("serverSetup.ai.engineUrl", "AI engine address")}
              placeholder="http://localhost:5001"
              value={draft.aiEngineUrl}
              onChange={(aiEngineUrl) => update({ aiEngineUrl })}
              error={errors.aiEngineUrl}
            />
            <FormField label={t("serverSetup.ai.provider", "Model provider")}>
              <Select
                comboboxProps={SETUP_DROPDOWN}
                options={providers}
                value={draft.aiProvider}
                onChange={(value) => {
                  if (value)
                    update(aiProviderChange(value as AiProvider, initial));
                }}
              />
            </FormField>
            {providerNeedsBaseUrl(draft.aiProvider) && (
              <TextField
                required
                type="url"
                label={t("serverSetup.ai.baseUrl", "Base URL")}
                placeholder="http://ollama:11434/v1"
                value={draft.aiBaseUrl}
                onChange={(aiBaseUrl) => update({ aiBaseUrl })}
                error={errors.aiBaseUrl}
              />
            )}
            <TextField
              type="password"
              label={t("serverSetup.ai.apiKey", "API key")}
              info={t(
                "serverSetup.ai.apiKeyHelp",
                "Leave empty to use the key the AI engine already has.",
              )}
              value={draft.aiApiKey}
              onChange={(aiApiKey) => update({ aiApiKey })}
            />
            {mode === "custom" && (
              <>
                <TextField
                  required
                  label={t("serverSetup.ai.fastModel", "Fast model")}
                  value={draft.aiFastModel}
                  onChange={(aiFastModel) => update({ aiFastModel })}
                  error={errors.aiFastModel}
                />
                <TextField
                  required
                  label={t("serverSetup.ai.smartModel", "Full model")}
                  value={draft.aiSmartModel}
                  onChange={(aiSmartModel) => update({ aiSmartModel })}
                  error={errors.aiSmartModel}
                />
              </>
            )}
          </>
        }
      >
        {() => (
          <SegmentedControl
            fullWidth
            ariaLabel={label}
            value={draft.ai}
            onChange={(ai) => {
              update({ ai });
              if (ai === "custom") setOpenSection("ai");
            }}
            options={choices}
          />
        )}
      </SettingRow>
      {draft.ai !== "off" && (
        <SettingRow
          label={mcpLabel}
          expand={draft.mcpEnabled ? sectionToggle(props, "mcp") : undefined}
          details={
            <>
              <FormField
                label={t("serverSetup.mcp.authLabel", "Agents sign in with")}
              >
                <Select
                  comboboxProps={SETUP_DROPDOWN}
                  options={[
                    {
                      value: "apikey",
                      label: t(
                        "serverSetup.mcp.apiKey",
                        "Their Stirling API key",
                      ),
                    },
                    {
                      value: "oauth",
                      label: t(
                        "serverSetup.mcp.oauth",
                        "OAuth identity provider",
                      ),
                    },
                  ]}
                  value={draft.mcpAuthMode}
                  onChange={(value) => {
                    if (value) update({ mcpAuthMode: value as McpAuthMode });
                  }}
                />
              </FormField>
              {draft.mcpAuthMode === "oauth" && (
                <TextField
                  required
                  type="url"
                  label={t("serverSetup.mcp.issuer", "Issuer URL")}
                  info={t(
                    "serverSetup.mcp.issuerHelp",
                    "Your identity provider's address. Agents' tokens must come from it and name this server's /mcp address.",
                  )}
                  placeholder="https://id.example.com"
                  value={draft.mcpIssuerUri}
                  onChange={(mcpIssuerUri) => update({ mcpIssuerUri })}
                  error={errors.mcpIssuerUri}
                />
              )}
            </>
          }
        >
          {() => (
            <OnOffControl
              ariaLabel={mcpLabel}
              value={draft.mcpEnabled}
              onChange={(mcpEnabled) => {
                update({ mcpEnabled });
                if (mcpEnabled) setOpenSection("mcp");
              }}
            />
          )}
        </SettingRow>
      )}
    </>
  );
}
