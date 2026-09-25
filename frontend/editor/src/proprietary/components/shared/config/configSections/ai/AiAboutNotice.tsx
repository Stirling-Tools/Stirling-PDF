import { useTranslation } from "react-i18next";
import { Alert, Group, Text, Code } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { handleExternalLinkClick } from "@app/platform/externalLinkClick";

/** Null until the docs page is written; setting it brings back the set-up guide button. */
export const AI_ENGINE_DOCS_URL: string | null = null;

/**
 * What the AI engine is, in the one place an admin is guaranteed to look.
 *
 * Replaces a note that led with the shared-secret environment variable - true, but meaningless to
 * anyone who did not already know there was a second container to run.
 */
export function AiAboutNotice({ cloud = false }: { cloud?: boolean }) {
  const { t } = useTranslation();

  if (cloud) {
    return (
      <Alert
        variant="light"
        color="blue"
        title={t(
          "admin.settings.ai.general.cloudNote.title",
          "About Stirling Cloud AI",
        )}
        icon={<Icon name="info" size="1rem" />}
      >
        <Text size="xs">
          {t(
            "admin.settings.ai.general.cloudNote.body",
            "AI runs on Stirling's infrastructure and is billed to the account this server is linked to. Documents the AI reads are processed by Stirling Cloud, not on your own hardware.",
          )}
        </Text>
      </Alert>
    );
  }

  return (
    <Alert
      variant="light"
      color="blue"
      title={t("admin.settings.ai.general.note.title", "About the AI engine")}
      icon={<Icon name="info" size="1rem" />}
    >
      <Group gap="md" align="center" wrap="nowrap">
        <Text size="xs" style={{ flexGrow: 1 }}>
          {t(
            "admin.settings.ai.general.note.intro",
            "A separate container you run next to Stirling. It does the reasoning; Stirling still does every page operation itself. It needs the same",
          )}{" "}
          <Code>STIRLING_ENGINE_SHARED_SECRET</Code>{" "}
          {t(
            "admin.settings.ai.general.note.outro",
            "on both containers and a model provider key. Documents the AI reads are sent to the provider you choose. Host your own Ollama to keep them in-house.",
          )}
        </Text>
        {AI_ENGINE_DOCS_URL && (
          <Button
            as="a"
            size="sm"
            variant="primary"
            href={AI_ENGINE_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            // Desktop opens links in the system browser; on web this is a no-op.
            onClick={(event) =>
              handleExternalLinkClick(AI_ENGINE_DOCS_URL, event)
            }
            rightSection={<Icon name="external-link" size="0.8rem" />}
            style={{ flexShrink: 0 }}
          >
            {t("admin.settings.ai.general.note.docs", "Set-up guide")}
          </Button>
        )}
      </Group>
    </Alert>
  );
}
