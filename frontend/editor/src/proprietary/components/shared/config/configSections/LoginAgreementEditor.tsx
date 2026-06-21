import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import apiClient from "@app/services/apiClient";
import { supportedLanguages } from "@app/i18n";
import { alert } from "@app/components/toast";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

const languageOptions = Object.entries(supportedLanguages).map(
  ([value, label]) => ({ value, label: `${label} (${value})` }),
);

interface LoginAgreementEditorProps {
  disabled?: boolean;
}

/**
 * Per-language editor for the login agreement markdown. Reads/writes
 * customFiles/disclaimer/<locale>.md directly via the admin endpoint, so saved text takes effect
 * on the next login without a restart (unlike the enable flags, which go through settings).
 */
export default function LoginAgreementEditor({
  disabled,
}: LoginAgreementEditorProps) {
  const { t, i18n } = useTranslation();
  const initialLocale = Object.prototype.hasOwnProperty.call(
    supportedLanguages,
    i18n.language,
  )
    ? i18n.language
    : "en-GB";

  const [locale, setLocale] = useState<string>(initialLocale);
  const [content, setContent] = useState("");
  const [loadedContent, setLoadedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await apiClient.get(
          `/api/v1/admin/login-agreement/${encodeURIComponent(locale)}`,
        );
        if (cancelled) return;
        const loaded = resp.data?.content ?? "";
        setContent(loaded);
        setLoadedContent(loaded);
      } catch {
        if (!cancelled) {
          setContent("");
          setLoadedContent("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const dirty = content !== loadedContent;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(
        `/api/v1/admin/login-agreement/${encodeURIComponent(locale)}`,
        { content },
      );
      setLoadedContent(content);
      alert({
        alertType: "success",
        title: t("admin.settings.legal.loginAgreement.saved", "Saved"),
        body: t(
          "admin.settings.legal.loginAgreement.savedBody",
          "Login agreement updated for {{locale}}",
          { locale },
        ),
      });
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save settings"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      <Group align="flex-end" justify="space-between" wrap="nowrap" gap="sm">
        <Select
          label={t("admin.settings.legal.loginAgreement.language", "Language")}
          data={languageOptions}
          value={locale}
          onChange={(value) => value && setLocale(value)}
          searchable
          disabled={disabled || saving}
          maxDropdownHeight={280}
          comboboxProps={{
            withinPortal: true,
            zIndex: Z_INDEX_OVER_CONFIG_MODAL,
          }}
          style={{ flex: 1, maxWidth: 340 }}
        />
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={disabled || loading || !dirty}
        >
          {t("admin.settings.legal.loginAgreement.save", "Save text")}
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Textarea
          label={t("admin.settings.legal.loginAgreement.editLabel", "Markdown")}
          placeholder={"## Heading\n\nYour disclaimer text..."}
          value={content}
          onChange={(event) => setContent(event.currentTarget.value)}
          autosize
          minRows={12}
          maxRows={28}
          disabled={disabled || loading}
          styles={{
            input: { fontFamily: "var(--mantine-font-family-monospace)" },
          }}
        />

        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("admin.settings.legal.loginAgreement.previewLabel", "Preview")}
          </Text>
          <Paper withBorder p="md" radius="sm" mih={200}>
            {content.trim() ? (
              <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
            ) : (
              <Text size="sm" c="dimmed">
                {t(
                  "admin.settings.legal.loginAgreement.emptyPreview",
                  "Nothing to preview yet.",
                )}
              </Text>
            )}
          </Paper>
        </div>
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        {t(
          "admin.settings.legal.loginAgreement.textDescription",
          "Saved to customFiles/disclaimer/{{locale}}.md and shown live on the next login. Leave blank to remove this language.",
          { locale },
        )}
      </Text>

      {loading && <Loader size="xs" />}
    </Stack>
  );
}
