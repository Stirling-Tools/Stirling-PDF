import { useTranslation } from "react-i18next";
import { Alert, Code, List, Stack, Text } from "@mantine/core";
import { Icon } from "@app/ui/Icon";

interface McpGuideProps {
  mode: string;
  mcpUrl: string;
  metadataUrl: string;
}

function StreamableHttpStep({ mcpUrl }: { mcpUrl: string }) {
  const { t } = useTranslation();
  return (
    <List.Item>
      {t("admin.settings.mcp.guide.step2", "In your MCP client add a")}{" "}
      <b>streamable-HTTP</b>{" "}
      {t("admin.settings.mcp.guide.step2b", "server pointing at:")}{" "}
      <Code>{mcpUrl}</Code>
    </List.Item>
  );
}

function BuiltinSteps({ mcpUrl }: { mcpUrl: string }) {
  const { t } = useTranslation();
  return (
    <>
      <List.Item>
        {t(
          "admin.settings.mcp.guide.step1Builtin",
          "Set the Resource ID to this server's public /mcp URL, Save, and restart.",
        )}
      </List.Item>
      <List.Item>
        {t(
          "admin.settings.mcp.guide.step2Builtin",
          "In ChatGPT or claude.ai, add a custom connector with the connector URL:",
        )}{" "}
        <Code>{mcpUrl}</Code>
      </List.Item>
      <List.Item>
        {t(
          "admin.settings.mcp.guide.step3Builtin",
          "Sign in with your Stirling account and approve access. Each user can revoke apps under Settings > MCP Server.",
        )}
      </List.Item>
    </>
  );
}

function OAuthSteps({
  mcpUrl,
  metadataUrl,
}: {
  mcpUrl: string;
  metadataUrl: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <List.Item>
        {t(
          "admin.settings.mcp.guide.step1",
          "Enter your OAuth issuer + resource ID above, Save, and restart.",
        )}
      </List.Item>
      <StreamableHttpStep mcpUrl={mcpUrl} />
      <List.Item>
        {t(
          "admin.settings.mcp.guide.step3",
          "The client auto-discovers OAuth from:",
        )}{" "}
        <Code>{metadataUrl}</Code>
      </List.Item>
      <List.Item>
        {t(
          "admin.settings.mcp.guide.step4",
          "Approve the sign-in; the client retries with a token. Tools appear grouped: convert, pages, misc, security, ai.",
        )}
      </List.Item>
    </>
  );
}

function ApiKeySteps({ mcpUrl }: { mcpUrl: string }) {
  const { t } = useTranslation();
  return (
    <>
      <List.Item>
        {t(
          "admin.settings.mcp.guide.step1ApiKey",
          "Create an API key under Account > API Keys (each user uses their own).",
        )}
      </List.Item>
      <StreamableHttpStep mcpUrl={mcpUrl} />
      <List.Item>
        {t("admin.settings.mcp.guide.step3ApiKey", "Send the key in an")}{" "}
        <Code>X-API-KEY</Code>{" "}
        {t(
          "admin.settings.mcp.guide.step3ApiKeyb",
          "header (or Authorization: Bearer <key>). No OAuth or metadata discovery is used.",
        )}
      </List.Item>
      <List.Item>
        {t(
          "admin.settings.mcp.guide.step4ApiKey",
          "Tools appear grouped: convert, pages, misc, security, ai - and every call is audited as the key's owner.",
        )}
      </List.Item>
    </>
  );
}

function GuideSteps({ mode, mcpUrl, metadataUrl }: McpGuideProps) {
  if (mode === "builtin") return <BuiltinSteps mcpUrl={mcpUrl} />;
  if (mode === "apikey") return <ApiKeySteps mcpUrl={mcpUrl} />;
  return <OAuthSteps mcpUrl={mcpUrl} metadataUrl={metadataUrl} />;
}

function useGuideTip(mode: string): string {
  const { t } = useTranslation();
  if (mode === "builtin") {
    return t(
      "admin.settings.mcp.guide.tipBuiltin",
      "Tip: built-in mode needs no external IdP and works with OAuth-only clients. Use Test connection to check what they will see.",
    );
  }
  if (mode === "apikey") {
    return t(
      "admin.settings.mcp.guide.tipApiKey",
      "Tip: API-key mode needs no external IdP - simplest for self-host. The key maps to its owning Stirling user.",
    );
  }
  return t(
    "admin.settings.mcp.guide.tip",
    "Tip: register the resource ID as an allowed audience in your IdP. Tested with MCP Inspector and Claude Desktop.",
  );
}

/** Compact per-mode setup steps under the MCP settings. */
export function McpGuide(props: McpGuideProps) {
  const { t } = useTranslation();
  const tip = useGuideTip(props.mode);
  return (
    <Alert
      variant="light"
      color="blue"
      title={t("admin.settings.mcp.guide.title", "Connect an MCP client")}
      icon={<Icon name="info" size="1rem" />}
    >
      <Stack gap={6}>
        <List size="xs" type="ordered" spacing={4}>
          <GuideSteps {...props} />
        </List>
        <Text size="xs" c="dimmed">
          {tip}
        </Text>
      </Stack>
    </Alert>
  );
}
