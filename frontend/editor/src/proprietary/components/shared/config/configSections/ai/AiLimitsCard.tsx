import { useTranslation } from "react-i18next";
import { NumberInput, Stack, Paper, Group } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import type { AiEngineLimits } from "@app/components/shared/config/configSections/aiEngineSettings";
import type { AiCardProps } from "@app/components/shared/config/configSections/ai/aiCardProps";

/** Guardrails on request size and concurrency. Pushed to the engine live. */
export function AiLimitsCard({
  settings,
  setSettings,
  isFieldPending,
}: AiCardProps) {
  const { t } = useTranslation();

  const setLimits = (patch: Partial<AiEngineLimits>) =>
    setSettings({
      ...settings,
      limits: { ...(settings.limits || {}), ...patch },
    });

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <NumberInput
          label={
            <Group gap="xs">
              <span>
                {t(
                  "admin.settings.ai.limits.maxPages.label",
                  "Max pages per request",
                )}
              </span>
              <PendingBadge show={isFieldPending("limits.maxPages")} />
            </Group>
          }
          description={t(
            "admin.settings.ai.limits.maxPages.description",
            "Guardrail: reject AI requests over this many PDF pages.",
          )}
          value={settings.limits?.maxPages ?? 0}
          onChange={(value) => setLimits({ maxPages: Number(value) })}
          min={1}
        />

        <NumberInput
          label={
            <Group gap="xs">
              <span>
                {t(
                  "admin.settings.ai.limits.maxCharacters.label",
                  "Max characters per request",
                )}
              </span>
              <PendingBadge show={isFieldPending("limits.maxCharacters")} />
            </Group>
          }
          description={t(
            "admin.settings.ai.limits.maxCharacters.description",
            "Guardrail: reject AI requests whose extracted text exceeds this length.",
          )}
          value={settings.limits?.maxCharacters ?? 0}
          onChange={(value) => setLimits({ maxCharacters: Number(value) })}
          min={1}
        />

        <NumberInput
          label={
            <Group gap="xs">
              <span>
                {t(
                  "admin.settings.ai.limits.modelMaxConcurrency.label",
                  "Model max concurrency",
                )}
              </span>
              <PendingBadge
                show={isFieldPending("limits.modelMaxConcurrency")}
              />
            </Group>
          }
          description={t(
            "admin.settings.ai.limits.modelMaxConcurrency.description",
            "Maximum simultaneous in-flight model calls across the whole engine.",
          )}
          value={settings.limits?.modelMaxConcurrency ?? 0}
          onChange={(value) =>
            setLimits({ modelMaxConcurrency: Number(value) })
          }
          min={1}
        />
      </Stack>
    </Paper>
  );
}
