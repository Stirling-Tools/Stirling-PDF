import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  TextInput,
  Textarea,
  Switch,
  Select,
  Stack,
  Paper,
  Text,
  Loader,
  Group,
  Alert,
  Code,
  List,
} from "@mantine/core";
import { alert } from "@app/components/toast";
import LocalIcon from "@app/components/shared/LocalIcon";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

interface McpAuthData {
  mode?: string;
  issuerUri?: string;
  jwksUri?: string;
  resourceId?: string;
  acceptedAudiences?: string[];
  usernameClaim?: string;
  requireExistingAccount?: boolean;
}

interface McpSettingsData {
  enabled?: boolean;
  scopesEnabled?: boolean;
  allowedOperations?: string[];
  blockedOperations?: string[];
  auth?: McpAuthData;
}

/** Parse a comma/space/newline separated list into a string[]. */
function parseOpList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ApiResponseWithPending<T> {
  _pending?: Partial<T>;
}

type McpApiResponse = McpSettingsData & ApiResponseWithPending<McpSettingsData>;

export default function AdminMcpSection() {
  const { t } = useTranslation();
  const { loginEnabled } = useLoginRequired();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<McpSettingsData>({
    sectionName: "mcp",
    fetchTransformer: async (): Promise<
      McpSettingsData & { _pending?: Partial<McpSettingsData> }
    > => {
      const response = await apiClient.get<McpApiResponse>(
        "/api/v1/admin/settings/section/mcp",
      );
      return response.data || {};
    },
    // Save nested auth.* keys as dot-notation through the root endpoint so siblings are preserved.
    saveTransformer: (s: McpSettingsData) => ({
      sectionData: {},
      deltaSettings: {
        "mcp.enabled": s.enabled ?? false,
        "mcp.scopesEnabled": s.scopesEnabled ?? true,
        "mcp.allowedOperations": s.allowedOperations ?? [],
        "mcp.blockedOperations": s.blockedOperations ?? [],
        "mcp.auth.mode": s.auth?.mode ?? "oauth",
        "mcp.auth.issuerUri": s.auth?.issuerUri ?? "",
        "mcp.auth.jwksUri": s.auth?.jwksUri ?? "",
        "mcp.auth.resourceId": s.auth?.resourceId ?? "",
        "mcp.auth.acceptedAudiences": s.auth?.acceptedAudiences ?? [],
        "mcp.auth.usernameClaim": s.auth?.usernameClaim ?? "sub",
        "mcp.auth.requireExistingAccount":
          s.auth?.requireExistingAccount ?? true,
      },
    }),
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    settings,
    loading,
  );

  const handleSave = async () => {
    try {
      await saveSettings();
      markSaved();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save settings"),
      });
    }
  };

  const handleDiscard = useCallback(() => {
    setSettings(resetToSnapshot());
  }, [resetToSnapshot, setSettings]);

  const setAuth = (patch: Partial<McpAuthData>) =>
    setSettings({ ...settings, auth: { ...(settings.auth || {}), ...patch } });

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-host";
  const mcpUrl = `${baseUrl}/mcp`;
  const metadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
  const authMode = settings.auth?.mode || "oauth";

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <div>
          <Text fw={600} size="lg">
            {t("admin.settings.mcp.title", "MCP Server")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "admin.settings.mcp.description",
              "Expose Stirling's PDF tools and AI agents to MCP clients over an OAuth-protected endpoint.",
            )}
          </Text>
        </div>

        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text fw={500} size="sm">
                  {t("admin.settings.mcp.enabled.label", "Enable MCP Server")}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t(
                    "admin.settings.mcp.enabled.description",
                    "When off (default), no /mcp endpoint, metadata, or MCP beans are loaded.",
                  )}
                </Text>
              </div>
              <Group gap="xs">
                <Switch
                  checked={settings.enabled || false}
                  onChange={(e) =>
                    setSettings({ ...settings, enabled: e.target.checked })
                  }
                />
                <PendingBadge show={isFieldPending("enabled")} />
              </Group>
            </Group>

            <Select
              label={
                <Group gap="xs">
                  <span>
                    {t("admin.settings.mcp.mode.label", "Authentication mode")}
                  </span>
                  <PendingBadge show={isFieldPending("auth.mode")} />
                </Group>
              }
              description={t(
                "admin.settings.mcp.mode.description",
                "OAuth needs an external IdP. API key uses a Stirling per-user API key (X-API-KEY) - simplest for self-host.",
              )}
              data={[
                { value: "oauth", label: "OAuth 2.1 (external IdP)" },
                { value: "apikey", label: "API key (Stirling per-user key)" },
              ]}
              value={authMode}
              onChange={(v) => setAuth({ mode: v || "oauth" })}
              allowDeselect={false}
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
              disabled={!settings.enabled}
            />

            {authMode === "apikey" && (
              <Alert variant="light" color="gray">
                <Text size="xs">
                  {t(
                    "admin.settings.mcp.apikeyNote",
                    "Clients send a Stirling API key in the X-API-KEY header (or Authorization: Bearer <key>). The key maps to its owning Stirling user - only provisioned accounts get in, and actions are audited as that user. Manage keys under Account → API Keys.",
                  )}
                </Text>
              </Alert>
            )}

            {authMode === "oauth" && (
              <>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.mcp.issuerUri.label",
                          "OAuth Issuer URL",
                        )}
                      </span>
                      <PendingBadge show={isFieldPending("auth.issuerUri")} />
                    </Group>
                  }
                  description={t(
                    "admin.settings.mcp.issuerUri.description",
                    "Your OAuth2 authorization server (must publish /.well-known/openid-configuration). Required when enabled.",
                  )}
                  value={settings.auth?.issuerUri || ""}
                  onChange={(e) => setAuth({ issuerUri: e.target.value })}
                  placeholder="https://auth.example.com"
                  disabled={!settings.enabled}
                />

                <TextInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.mcp.resourceId.label",
                          "Resource ID",
                        )}
                      </span>
                      <PendingBadge show={isFieldPending("auth.resourceId")} />
                    </Group>
                  }
                  description={t(
                    "admin.settings.mcp.resourceId.description",
                    "This server's public /mcp URL. Tokens must list it in their audience (RFC 8707) or they are rejected.",
                  )}
                  value={settings.auth?.resourceId || ""}
                  onChange={(e) => setAuth({ resourceId: e.target.value })}
                  placeholder={mcpUrl}
                  disabled={!settings.enabled}
                />

                <TextInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.mcp.acceptedAudiences.label",
                          "Additional accepted audiences (optional)",
                        )}
                      </span>
                      <PendingBadge
                        show={isFieldPending("auth.acceptedAudiences")}
                      />
                    </Group>
                  }
                  description={t(
                    "admin.settings.mcp.acceptedAudiences.description",
                    "Extra token audience values accepted besides the Resource ID (comma or space separated). Leave blank for strict RFC 8707. Needed for IdPs that cannot mint resource audiences - e.g. Supabase's OAuth server always issues aud=authenticated.",
                  )}
                  value={(settings.auth?.acceptedAudiences || []).join(" ")}
                  onChange={(e) =>
                    setAuth({ acceptedAudiences: parseOpList(e.target.value) })
                  }
                  placeholder="authenticated"
                  disabled={!settings.enabled}
                />

                <TextInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.mcp.jwksUri.label",
                          "JWKS URL (optional)",
                        )}
                      </span>
                      <PendingBadge show={isFieldPending("auth.jwksUri")} />
                    </Group>
                  }
                  description={t(
                    "admin.settings.mcp.jwksUri.description",
                    "Leave blank to discover it from the issuer. Set only if your IdP serves keys at a non-standard URL.",
                  )}
                  value={settings.auth?.jwksUri || ""}
                  onChange={(e) => setAuth({ jwksUri: e.target.value })}
                  placeholder={t(
                    "admin.settings.mcp.jwksUri.placeholder",
                    "Auto-discovered from issuer",
                  )}
                  disabled={!settings.enabled}
                />

                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text fw={500} size="sm">
                      {t(
                        "admin.settings.mcp.scopes.label",
                        "Enforce OAuth scopes",
                      )}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {t(
                        "admin.settings.mcp.scopes.description",
                        "Require mcp.tools.read for read ops and mcp.tools.write for write/AI ops.",
                      )}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Switch
                      checked={settings.scopesEnabled ?? true}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          scopesEnabled: e.target.checked,
                        })
                      }
                      disabled={!settings.enabled}
                    />
                    <PendingBadge show={isFieldPending("scopesEnabled")} />
                  </Group>
                </Group>

                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text fw={500} size="sm">
                      {t(
                        "admin.settings.mcp.requireAccount.label",
                        "Require an existing Stirling account",
                      )}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {t(
                        "admin.settings.mcp.requireAccount.description",
                        "Only let tokens through if their subject maps to a provisioned, enabled Stirling user.",
                      )}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Switch
                      checked={settings.auth?.requireExistingAccount ?? true}
                      onChange={(e) =>
                        setAuth({ requireExistingAccount: e.target.checked })
                      }
                      disabled={!settings.enabled}
                    />
                    <PendingBadge
                      show={isFieldPending("auth.requireExistingAccount")}
                    />
                  </Group>
                </Group>

                <TextInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.mcp.usernameClaim.label",
                          "Username claim",
                        )}
                      </span>
                      <PendingBadge
                        show={isFieldPending("auth.usernameClaim")}
                      />
                    </Group>
                  }
                  description={t(
                    "admin.settings.mcp.usernameClaim.description",
                    "JWT claim matched against a Stirling username (e.g. sub, email, preferred_username).",
                  )}
                  value={settings.auth?.usernameClaim || ""}
                  onChange={(e) => setAuth({ usernameClaim: e.target.value })}
                  placeholder="sub"
                  disabled={!settings.enabled}
                />
              </>
            )}

            <Textarea
              label={
                <Group gap="xs">
                  <span>
                    {t("admin.settings.mcp.allowedOps.label", "Allowed tools")}
                  </span>
                  <PendingBadge show={isFieldPending("allowedOperations")} />
                </Group>
              }
              description={t(
                "admin.settings.mcp.allowedOps.description",
                "If set, ONLY these operation ids are exposed (an allow-list; comma or space separated). Leave blank to expose all enabled tools except any blocked below.",
              )}
              value={(settings.allowedOperations || []).join(" ")}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  allowedOperations: parseOpList(e.target.value),
                })
              }
              placeholder="merge-pdfs split-pdf rotate-pdf"
              autosize
              minRows={1}
              maxRows={3}
              disabled={!settings.enabled}
            />

            <Textarea
              label={
                <Group gap="xs">
                  <span>
                    {t("admin.settings.mcp.blockedOps.label", "Blocked tools")}
                  </span>
                  <PendingBadge show={isFieldPending("blockedOperations")} />
                </Group>
              }
              description={t(
                "admin.settings.mcp.blockedOps.description",
                "Operation ids to hide from MCP (comma or space separated), e.g. add-password remove-password. Leave blank to expose all enabled tools.",
              )}
              value={(settings.blockedOperations || []).join(" ")}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  blockedOperations: parseOpList(e.target.value),
                })
              }
              placeholder="add-password sanitize-pdf"
              autosize
              minRows={1}
              maxRows={3}
              disabled={!settings.enabled}
            />
          </Stack>
        </Paper>

        {/* Compact in-page setup guide */}
        <Alert
          variant="light"
          color="blue"
          title={t("admin.settings.mcp.guide.title", "Connect an MCP client")}
          icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
        >
          <Stack gap={6}>
            <List size="xs" type="ordered" spacing={4}>
              {authMode === "oauth" ? (
                <>
                  <List.Item>
                    {t(
                      "admin.settings.mcp.guide.step1",
                      "Enter your OAuth issuer + resource ID above, Save, and restart.",
                    )}
                  </List.Item>
                  <List.Item>
                    {t(
                      "admin.settings.mcp.guide.step2",
                      "In your MCP client add a",
                    )}{" "}
                    <b>streamable-HTTP</b>{" "}
                    {t(
                      "admin.settings.mcp.guide.step2b",
                      "server pointing at:",
                    )}{" "}
                    <Code>{mcpUrl}</Code>
                  </List.Item>
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
              ) : (
                <>
                  <List.Item>
                    {t(
                      "admin.settings.mcp.guide.step1ApiKey",
                      "Create an API key under Account → API Keys (each user uses their own).",
                    )}
                  </List.Item>
                  <List.Item>
                    {t(
                      "admin.settings.mcp.guide.step2",
                      "In your MCP client add a",
                    )}{" "}
                    <b>streamable-HTTP</b>{" "}
                    {t(
                      "admin.settings.mcp.guide.step2b",
                      "server pointing at:",
                    )}{" "}
                    <Code>{mcpUrl}</Code>
                  </List.Item>
                  <List.Item>
                    {t(
                      "admin.settings.mcp.guide.step3ApiKey",
                      "Send the key in an",
                    )}{" "}
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
              )}
            </List>
            <Text size="xs" c="dimmed">
              {authMode === "oauth"
                ? t(
                    "admin.settings.mcp.guide.tip",
                    "Tip: register the resource ID as an allowed audience in your IdP. Tested with MCP Inspector and Claude Desktop.",
                  )
                : t(
                    "admin.settings.mcp.guide.tipApiKey",
                    "Tip: API-key mode needs no external IdP - simplest for self-host. The key maps to its owning Stirling user.",
                  )}
            </Text>
          </Stack>
        </Alert>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={saving}
        loginEnabled={loginEnabled}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </div>
  );
}
