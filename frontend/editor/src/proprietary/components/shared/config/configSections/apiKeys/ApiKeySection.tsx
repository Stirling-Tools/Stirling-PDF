import React from "react";
import { Box, Group, Paper } from "@mantine/core";
import { Button } from "@app/ui/Button";
import ContentCopyIcon from "@mui/icons-material/ContentCopyRounded";
import RefreshIcon from "@mui/icons-material/RefreshRounded";
import FitText from "@app/components/shared/FitText";
import { useTranslation } from "react-i18next";

interface ApiKeySectionProps {
  publicKey: string;
  copied: string | null;
  onCopy: (text: string, tag: string) => void;
  onRefresh: () => void;
  disabled?: boolean;
}

export default function ApiKeySection({
  publicKey,
  copied,
  onCopy,
  onRefresh,
  disabled,
}: ApiKeySectionProps) {
  const { t } = useTranslation();
  return (
    <>
      <Paper
        radius="md"
        p={18}
        style={{
          background: "var(--api-keys-card-bg)",
          border: "1px solid var(--api-keys-card-border)",
          boxShadow: "0 2px 8px var(--api-keys-card-shadow)",
        }}
      >
        <Group align="flex-end" wrap="nowrap">
          <Box style={{ flex: 1 }}>
            <Box
              style={{
                background: "var(--api-keys-input-bg)",
                border: "1px solid var(--api-keys-input-border)",
                borderRadius: 8,
                padding: "8px 12px",
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: 14,
                minHeight: 36,
                display: "flex",
                alignItems: "center",
              }}
              aria-label={t(
                "config.apiKeys.publicKeyAriaLabel",
                "Public API key",
              )}
            >
              <FitText text={publicKey} />
            </Box>
          </Box>
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            onClick={() => onCopy(publicKey, "public")}
            leftSection={
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            }
            style={{
              marginLeft: 12,
            }}
            aria-label={t("config.apiKeys.copyKeyAriaLabel", "Copy API key")}
          >
            {copied === "public"
              ? t("common.copied", "Copied!")
              : t("common.copy", "Copy")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            onClick={onRefresh}
            leftSection={
              <RefreshIcon sx={{ fontSize: 14 }} />
            }
            style={{
              marginLeft: 8,
            }}
            disabled={disabled}
            aria-label={t("config.apiKeys.refreshAriaLabel", "Refresh API key")}
          >
            {t("common.refresh", "Refresh")}
          </Button>
        </Group>
      </Paper>
    </>
  );
}
