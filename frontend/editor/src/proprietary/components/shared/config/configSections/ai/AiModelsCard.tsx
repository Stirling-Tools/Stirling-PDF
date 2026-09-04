import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import {
  TextInput,
  NumberInput,
  PasswordInput,
  Autocomplete,
  Select,
  Stack,
  Paper,
  Text,
  Group,
  Alert,
} from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import {
  AiEngineModels,
  MODEL_SUGGESTIONS,
  MASKED_SECRET,
} from "@app/components/shared/config/configSections/aiEngineSettings";
import type { AiCardProps } from "@app/components/shared/config/configSections/ai/aiCardProps";

interface AiModelsCardProps extends AiCardProps {
  apiKeyDirty: boolean;
  setApiKeyDirty: (dirty: boolean) => void;
}

/** Chat models and the provider credential behind them. Pushed to the engine live. */
export function AiModelsCard({
  settings,
  setSettings,
  isFieldPending,
  apiKeyDirty,
  setApiKeyDirty,
}: AiModelsCardProps) {
  const { t } = useTranslation();

  const setModels = (patch: Partial<AiEngineModels>) =>
    setSettings({
      ...settings,
      models: { ...(settings.models || {}), ...patch },
    });
  const provider = settings.models?.provider || "anthropic";
  const showApiKey = provider !== "ollama";
  const showBaseUrl = provider === "ollama" || provider === "custom";
  const apiKeyLabel =
    provider === "anthropic"
      ? t("admin.settings.ai.models.apiKey.anthropic", "Anthropic API key")
      : provider === "openai"
        ? t("admin.settings.ai.models.apiKey.openai", "OpenAI API key")
        : t("admin.settings.ai.models.apiKey.generic", "API key");
  const modelSuggestions = MODEL_SUGGESTIONS[provider] || [];
  const apiKeyPlaceholder =
    provider === "anthropic"
      ? "sk-ant-..."
      : provider === "openai"
        ? "sk-..."
        : "";

  return (
    <>
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Select
            label={
              <Group gap="xs">
                <span>
                  {t("admin.settings.ai.models.provider.label", "Provider")}
                </span>
                <PendingBadge show={isFieldPending("models.provider")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.ai.models.provider.description",
                    "Which LLM provider the engine talks to.",
                  )}
                />
              </Group>
            }
            data={[
              { value: "anthropic", label: "Anthropic" },
              { value: "openai", label: "OpenAI" },
              { value: "ollama", label: "Ollama" },
              { value: "custom", label: "Custom (OpenAI-compatible)" },
            ]}
            value={provider}
            onChange={(v) => {
              const next = v || "anthropic";
              const patch: Partial<AiEngineModels> = { provider: next };
              // Clear fields the new provider doesn't use so a stale hidden value can't
              // leak into the payload (e.g. an Ollama base URL after switching to Anthropic).
              if (next !== "ollama" && next !== "custom") patch.baseUrl = "";
              if (next !== provider) {
                // Only one key is stored and it belongs to its provider; carrying it across a
                // switch would 401 every call while the field still read "Saved", so clear it.
                patch.apiKey = "";
                setApiKeyDirty(true);
              }
              setModels(patch);
            }}
            allowDeselect={false}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
          />

          <Autocomplete
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.ai.models.smartModel.label",
                    "Smart model",
                  )}
                </span>
                <PendingBadge show={isFieldPending("models.smartModel")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.ai.models.smartModel.description",
                    "High-capability model for complex reasoning. Free text; suggestions are hints only.",
                  )}
                />
              </Group>
            }
            data={modelSuggestions}
            value={settings.models?.smartModel || ""}
            onChange={(value) => setModels({ smartModel: value })}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
          />

          <Autocomplete
            label={
              <Group gap="xs">
                <span>
                  {t("admin.settings.ai.models.fastModel.label", "Fast model")}
                </span>
                <PendingBadge show={isFieldPending("models.fastModel")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.ai.models.fastModel.description",
                    "Cheaper, faster model for lightweight tasks. Free text; suggestions are hints only.",
                  )}
                />
              </Group>
            }
            data={modelSuggestions}
            value={settings.models?.fastModel || ""}
            onChange={(value) => setModels({ fastModel: value })}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
          />

          <NumberInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.ai.models.smartMaxTokens.label",
                    "Smart model max tokens",
                  )}
                </span>
                <PendingBadge show={isFieldPending("models.smartMaxTokens")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.ai.models.smartMaxTokens.description",
                    "Maximum output tokens for the smart model.",
                  )}
                />
              </Group>
            }
            value={settings.models?.smartMaxTokens ?? 0}
            onChange={(value) => setModels({ smartMaxTokens: Number(value) })}
            min={1}
          />

          <NumberInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.ai.models.fastMaxTokens.label",
                    "Fast model max tokens",
                  )}
                </span>
                <PendingBadge show={isFieldPending("models.fastMaxTokens")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.ai.models.fastMaxTokens.description",
                    "Maximum output tokens for the fast model.",
                  )}
                />
              </Group>
            }
            value={settings.models?.fastMaxTokens ?? 0}
            onChange={(value) => setModels({ fastMaxTokens: Number(value) })}
            min={1}
          />

          {showApiKey && (
            <PasswordInput
              label={
                <Group gap="xs">
                  <span>{apiKeyLabel}</span>
                  <PendingBadge show={isFieldPending("models.apiKey")} />
                  <InfoTooltip
                    label={t(
                      "admin.settings.ai.models.apiKey.description",
                      "Leave blank to use the engine's own environment credential. Applies to self-hosted single-engine deployments.",
                    )}
                  />
                </Group>
              }
              // Keep the field blank when a key is already stored (returned masked as "********");
              // a pre-filled sentinel would corrupt the key on append, so bind the real value only once typed.
              value={apiKeyDirty ? (settings.models?.apiKey ?? "") : ""}
              onChange={(e) => {
                setApiKeyDirty(true);
                setModels({ apiKey: e.target.value });
              }}
              placeholder={
                !apiKeyDirty && settings.models?.apiKey === MASKED_SECRET
                  ? t(
                      "admin.settings.ai.models.apiKey.setPlaceholder",
                      "Saved - leave blank to keep the current key",
                    )
                  : apiKeyPlaceholder
              }
            />
          )}

          {showBaseUrl && (
            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.models.baseUrl.label",
                      "Provider base URL",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("models.baseUrl")} />
                  <InfoTooltip
                    label={t(
                      "admin.settings.ai.models.baseUrl.description",
                      "Base URL of the OpenAI-compatible / Ollama endpoint, e.g. http://ollama:11434/v1.",
                    )}
                  />
                </Group>
              }
              value={settings.models?.baseUrl || ""}
              onChange={(e) => setModels({ baseUrl: e.target.value })}
              placeholder="http://ollama:11434/v1"
            />
          )}

          {showBaseUrl && (
            <Alert
              variant="light"
              color="orange"
              icon={
                <LocalIcon icon="warning-rounded" width="1rem" height="1rem" />
              }
            >
              <Text size="xs">
                {t(
                  "admin.settings.ai.models.baseUrl.warning",
                  "The base URL must point at a trusted internal endpoint. The engine will make server-side requests to it, so an untrusted value is SSRF-sensitive.",
                )}
              </Text>
            </Alert>
          )}

          {showBaseUrl && (
            <Alert
              variant="light"
              color="blue"
              icon={
                <LocalIcon icon="info-rounded" width="1rem" height="1rem" />
              }
            >
              <Text size="xs">
                {t(
                  "admin.settings.ai.models.baseUrl.contextWindow",
                  "Use a context window of at least 16,384 tokens. Smaller windows silently drop part of the prompt. Ollama defaults to 4,096 - raise OLLAMA_CONTEXT_LENGTH.",
                )}
              </Text>
            </Alert>
          )}
        </Stack>
      </Paper>
    </>
  );
}
