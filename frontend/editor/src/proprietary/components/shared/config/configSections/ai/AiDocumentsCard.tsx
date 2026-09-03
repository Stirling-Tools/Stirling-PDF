import { useTranslation } from "react-i18next";
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
  AiEngineRag,
  EMBEDDING_MODEL_SUGGESTIONS,
  MASKED_SECRET,
} from "@app/components/shared/config/configSections/aiEngineSettings";
import type { AiCardProps } from "@app/components/shared/config/configSections/ai/aiCardProps";

interface AiDocumentsCardProps extends AiCardProps {
  embeddingApiKeyDirty: boolean;
  setEmbeddingApiKeyDirty: (dirty: boolean) => void;
}

/** Embeddings and retrieval. Changing the embedding model needs a re-index. */
export function AiDocumentsCard({
  settings,
  setSettings,
  isFieldPending,
  embeddingApiKeyDirty,
  setEmbeddingApiKeyDirty,
}: AiDocumentsCardProps) {
  const { t } = useTranslation();

  const setRag = (patch: Partial<AiEngineRag>) =>
    setSettings({ ...settings, rag: { ...(settings.rag || {}), ...patch } });
  const embeddingProvider = settings.rag?.embeddingProvider || "voyageai";
  const showEmbeddingApiKey = embeddingProvider !== "ollama";
  const showEmbeddingBaseUrl =
    embeddingProvider === "ollama" || embeddingProvider === "custom";
  const embeddingApiKeyLabel =
    embeddingProvider === "voyageai"
      ? t(
          "admin.settings.ai.documents.embeddingApiKey.voyageai",
          "VoyageAI API key",
        )
      : embeddingProvider === "openai"
        ? t(
            "admin.settings.ai.documents.embeddingApiKey.openai",
            "OpenAI API key",
          )
        : t(
            "admin.settings.ai.documents.embeddingApiKey.generic",
            "Embedding API key",
          );
  const embeddingSuggestions =
    EMBEDDING_MODEL_SUGGESTIONS[embeddingProvider] || [];
  const embeddingApiKeyPlaceholder =
    embeddingProvider === "voyageai"
      ? "pa-..."
      : embeddingProvider === "openai"
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
                  {t(
                    "admin.settings.ai.documents.embeddingProvider.label",
                    "Embedding provider",
                  )}
                </span>
                <PendingBadge show={isFieldPending("rag.embeddingProvider")} />
              </Group>
            }
            description={t(
              "admin.settings.ai.documents.embeddingProvider.description",
              "Provider used to turn document text into vector embeddings.",
            )}
            data={[
              { value: "voyageai", label: "VoyageAI" },
              { value: "openai", label: "OpenAI" },
              { value: "ollama", label: "Ollama" },
              { value: "custom", label: "Custom (OpenAI-compatible)" },
            ]}
            value={embeddingProvider}
            onChange={(v) => {
              const next = v || "voyageai";
              const patch: Partial<AiEngineRag> = { embeddingProvider: next };
              // Clear fields the new provider doesn't use so a stale hidden value can't
              // leak into the payload.
              if (next !== "ollama" && next !== "custom")
                patch.embeddingBaseUrl = "";
              if (next !== embeddingProvider) {
                // One stored key, issued for one provider: carrying it across a switch
                // would 401 while the field still read "Saved". Require a re-entry.
                patch.embeddingApiKey = "";
                setEmbeddingApiKeyDirty(true);
              }
              setRag(patch);
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
                    "admin.settings.ai.documents.embeddingModel.label",
                    "Embedding model",
                  )}
                </span>
                <PendingBadge show={isFieldPending("rag.embeddingModel")} />
              </Group>
            }
            description={t(
              "admin.settings.ai.documents.embeddingModel.description",
              "Embedding model name. Free text; suggestions are hints only.",
            )}
            data={embeddingSuggestions}
            value={settings.rag?.embeddingModel || ""}
            onChange={(value) => setRag({ embeddingModel: value })}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
          />

          {showEmbeddingApiKey && (
            <PasswordInput
              label={
                <Group gap="xs">
                  <span>{embeddingApiKeyLabel}</span>
                  <PendingBadge show={isFieldPending("rag.embeddingApiKey")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.documents.embeddingApiKey.description",
                "Leave blank to use the engine's own environment credential. Applies to self-hosted single-engine deployments.",
              )}
              // Blank when a key is already stored (returned masked as "********") so
              // appending to the sentinel can't corrupt the saved key.
              value={
                embeddingApiKeyDirty
                  ? (settings.rag?.embeddingApiKey ?? "")
                  : ""
              }
              onChange={(e) => {
                setEmbeddingApiKeyDirty(true);
                setRag({ embeddingApiKey: e.target.value });
              }}
              placeholder={
                !embeddingApiKeyDirty &&
                settings.rag?.embeddingApiKey === MASKED_SECRET
                  ? t(
                      "admin.settings.ai.documents.embeddingApiKey.setPlaceholder",
                      "Saved - leave blank to keep the current key",
                    )
                  : embeddingApiKeyPlaceholder
              }
            />
          )}

          {showEmbeddingBaseUrl && (
            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.documents.embeddingBaseUrl.label",
                      "Embedding base URL",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("rag.embeddingBaseUrl")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.documents.embeddingBaseUrl.description",
                "Base URL of the OpenAI-compatible / Ollama embeddings endpoint, e.g. http://ollama:11434/v1. Must point at a trusted internal endpoint (SSRF-sensitive).",
              )}
              value={settings.rag?.embeddingBaseUrl || ""}
              onChange={(e) => setRag({ embeddingBaseUrl: e.target.value })}
              placeholder="http://ollama:11434/v1"
            />
          )}

          <NumberInput
            label={
              <Group gap="xs">
                <span>
                  {t("admin.settings.ai.documents.topK.label", "Top K")}
                </span>
                <PendingBadge show={isFieldPending("rag.topK")} />
              </Group>
            }
            description={t(
              "admin.settings.ai.documents.topK.description",
              "Number of most-relevant chunks retrieved per search.",
            )}
            value={settings.rag?.topK ?? 0}
            onChange={(value) => setRag({ topK: Number(value) })}
            min={1}
          />

          <NumberInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.ai.documents.maxSearches.label",
                    "Max searches",
                  )}
                </span>
                <PendingBadge show={isFieldPending("rag.maxSearches")} />
              </Group>
            }
            description={t(
              "admin.settings.ai.documents.maxSearches.description",
              "Maximum number of retrieval searches the agent may run per request.",
            )}
            value={settings.rag?.maxSearches ?? 0}
            onChange={(value) => setRag({ maxSearches: Number(value) })}
            min={0}
          />
        </Stack>
      </Paper>

      <Alert
        variant="light"
        color="orange"
        title={t(
          "admin.settings.ai.documents.reindexNote.title",
          "Re-index required",
        )}
        icon={<LocalIcon icon="warning-rounded" width="1rem" height="1rem" />}
      >
        <Text size="xs">
          {t(
            "admin.settings.ai.documents.reindexNote.body",
            "Changing the embedding model takes effect immediately, but documents indexed with the previous model must be re-indexed for search to return correct results.",
          )}
        </Text>
      </Alert>
    </>
  );
}
