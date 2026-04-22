import React, { useState } from "react";
import { Anchor, Group, Stack, Text, Button, Paper } from "@mantine/core";
import UsageSection from "@app/components/shared/config/configSections/apiKeys/UsageSection";
import ApiKeySection from "@app/components/shared/config/configSections/apiKeys/ApiKeySection";
import RefreshModal from "@app/components/shared/config/configSections/apiKeys/RefreshModal";
import { useCredits } from "@app/components/shared/config/configSections/apiKeys/hooks/useCredits";
import useApiKey from "@app/components/shared/config/configSections/apiKeys/hooks/useApiKey";
import SkeletonLoader from "@app/components/shared/SkeletonLoader";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { isUserAnonymous } from "@app/auth/supabase";

export default function ApiKeys() {
  const [copied, setCopied] = useState<string | null>(null);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAnonymous = Boolean(user && isUserAnonymous(user));

  const { data: credits, isLoading: creditsLoading } = useCredits();
  const {
    apiKey,
    isLoading: apiKeyLoading,
    refresh,
    isRefreshing,
    error: apiKeyError,
    refetch,
    hasAttempted,
  } = useApiKey();

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1600);
    } catch (e) {
      // noop – you can surface a notification here
      console.error(e);
    }
  };

  const refreshKeys = async () => {
    try {
      await refresh();
    } finally {
      setShowRefreshModal(false);
    }
  };

  const goToAccount = () => {
    window.dispatchEvent(
      new CustomEvent("appConfig:navigate", { detail: { key: "overview" } }),
    );
  };

  const showUsage = Boolean(credits);

  return (
    <Stack gap={20} p={0}>
      {showUsage && (
        <UsageSection
          apiUsage={credits!}
          obscured={Boolean(!apiKey && hasAttempted && !isAnonymous)}
          overlayMessage={t(
            "config.apiKeys.overlayMessage",
            "Generate a key to see credits and available credits",
          )}
          loading={creditsLoading}
        />
      )}

      {!isAnonymous && apiKeyError && (
        <Text size="sm" c="red.5">
          {t(
            "config.apiKeys.generateError",
            "We couldn't generate your API key.",
          )}{" "}
          <Anchor
            component="button"
            underline="always"
            onClick={refetch}
            c="red.4"
          >
            {t("common.retry", "Retry")}
          </Anchor>
        </Text>
      )}

      {isAnonymous ? (
        <Paper
          radius="md"
          p={18}
          style={{
            background: "var(--api-keys-card-bg)",
            border: "1px solid var(--api-keys-card-border)",
            boxShadow: "0 2px 8px var(--api-keys-card-shadow)",
          }}
        >
          <Stack gap={10}>
            <Text fw={500}>{t("config.apiKeys.label", "API Key")}</Text>
            <Group
              justify="space-between"
              wrap="nowrap"
              align="center"
              style={{ gap: "1rem" }}
            >
              <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                {t(
                  "config.apiKeys.guestInfo",
                  "Guest users do not receive API keys. Create an account to get an API key you can use in your applications.",
                )}
              </Text>
              <Button size="sm" onClick={goToAccount}>
                {t("config.apiKeys.goToAccount", "Go to Account")}
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : apiKeyLoading ? (
        <>
          <Text size="sm" c="dimmed" style={{ marginBottom: 8 }}>
            {t(
              "config.apiKeys.description",
              "Your API key for accessing Stirling's suite of PDF tools. Copy it to your project or refresh to generate a new one.",
            )}
          </Text>
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              background: "var(--api-keys-card-bg)",
              border: "1px solid var(--api-keys-card-border)",
              boxShadow: "0 2px 8px var(--api-keys-card-shadow)",
            }}
          >
            <Group align="center" gap={12} wrap="nowrap">
              <SkeletonLoader type="block" width="100%" height={36} />
              <SkeletonLoader type="block" width={76} height={32} />
              <SkeletonLoader type="block" width={92} height={32} />
            </Group>
          </div>
        </>
      ) : (
        <ApiKeySection
          publicKey={apiKey ?? ""}
          copied={copied}
          onCopy={copy}
          onRefresh={() => setShowRefreshModal(true)}
          disabled={isRefreshing}
        />
      )}

      <RefreshModal
        opened={showRefreshModal}
        onClose={() => setShowRefreshModal(false)}
        onConfirm={refreshKeys}
      />
    </Stack>
  );
}
