import React, { useState } from "react";
import { Anchor, Group, Stack, Text, Paper, Skeleton } from "@mantine/core";
// eslint-disable-next-line no-restricted-imports
import ApiKeySection from "./apiKeys/ApiKeySection";
// eslint-disable-next-line no-restricted-imports
import RefreshModal from "./apiKeys/RefreshModal";
// eslint-disable-next-line no-restricted-imports
import useApiKey from "./apiKeys/hooks/useApiKey";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";

export default function ApiKeys() {
  const [copied, setCopied] = useState<string | null>(null);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const { t } = useTranslation();

  const { apiKey, isLoading: apiKeyLoading, refresh, isRefreshing, error: apiKeyError, refetch } = useApiKey();

  const copy = async (text: string, tag: string) => {
    try {
      // Try modern Clipboard API first (requires HTTPS)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(tag);
        setTimeout(() => setCopied(null), 1600);
      } else {
        // Fallback for HTTP: use old execCommand method
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        if (document.execCommand('copy')) {
          setCopied(tag);
          setTimeout(() => setCopied(null), 1600);
        }

        document.body.removeChild(textarea);
      }
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const refreshKeys = async () => {
    try {
      await refresh();
    } finally {
      setShowRefreshModal(false);
    }
  };

  return (
    <Stack gap={20} p={0}>
      <Text size="sm" c="dimmed">
        {t('config.apiKeys.intro', 'Use your API key to programmatically access Stirling PDF\'s processing capabilities.')}
      </Text>

      <Paper
        p="md"
        radius="md"
        style={{
          background: "var(--bg-muted)",
          border: "1px solid var(--border-subtle)"
        }}
      >
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <LocalIcon icon="info-rounded" width={18} height={18} style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
          <Stack gap={8} style={{ flex: 1 }}>
            <Text size="sm" fw={500}>
              {t('config.apiKeys.docsTitle', 'API Documentation')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('config.apiKeys.docsDescription', 'Learn more about integrating with Stirling PDF:')}
            </Text>
            <Stack gap={4}>
              <Text size="sm">
                <Anchor
                  href="https://docs.stirlingpdf.com/API"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {t('config.apiKeys.docsLink', 'API Documentation')}
                  <LocalIcon icon="open-in-new-rounded" width={14} height={14} />
                </Anchor>
              </Text>
              <Text size="sm">
                <Anchor
                  href="https://registry.scalar.com/@stirlingpdf/apis/stirling-pdf-processing-api/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {t('config.apiKeys.schemaLink', 'API Schema Reference')}
                  <LocalIcon icon="open-in-new-rounded" width={14} height={14} />
                </Anchor>
              </Text>
            </Stack>
          </Stack>
        </Group>
      </Paper>

      {apiKeyError && (
        <Text size="sm" c="red.5">
          {t('config.apiKeys.generateError', "We couldn't generate your API key.")} {" "}
          <Anchor component="button" underline="always" onClick={refetch} c="red.4">
            {t('common.retry', 'Retry')}
          </Anchor>
        </Text>
      )}

      {apiKeyLoading ? (
        <div style={{ padding: 18, borderRadius: 12, background: "var(--api-keys-card-bg)", border: "1px solid var(--api-keys-card-border)", boxShadow: "0 2px 8px var(--api-keys-card-shadow)" }}>
          <Group align="center" gap={12} wrap="nowrap">
            <Skeleton height={36} style={{ flex: 1 }} />
            <Skeleton height={32} width={76} />
            <Skeleton height={32} width={92} />
          </Group>
        </div>
      ) : (
        <ApiKeySection
          publicKey={apiKey ?? ""}
          copied={copied}
          onCopy={copy}
          onRefresh={() => setShowRefreshModal(true)}
          disabled={isRefreshing}
        />
      )}

      <Text size="sm" c="dimmed" style={{ marginTop: -8 }}>
        {t('config.apiKeys.usage', 'Include this key in the X-API-KEY header with all API requests.')}
      </Text>

      <RefreshModal
        opened={showRefreshModal}
        onClose={() => setShowRefreshModal(false)}
        onConfirm={refreshKeys}
      />
    </Stack>
  );
}
