import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import {
  TextInput,
  Textarea,
  Switch,
  Select,
  Stack,
  Paper,
  Text,
  Group,
  Alert,
} from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type {
  McpAuthData,
  McpBuiltinAuthData,
} from "@app/components/shared/config/configSections/server/serverSettings";
import type { McpCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";
import { McpConnectionPanel } from "@app/components/shared/config/configSections/server/McpConnectionPanel";
import { McpBuiltinFields } from "@app/components/shared/config/configSections/server/McpBuiltinFields";
import { McpResultsFields } from "@app/components/shared/config/configSections/server/McpResultsFields";
import { McpGuide } from "@app/components/shared/config/configSections/server/McpGuide";

/** Parse a comma/space/newline separated list into a string[]. */
function parseOpList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The MCP endpoint, how it authenticates, and which tools it exposes. */
export function McpCard({
  settings,
  setSettings,
  isFieldPending,
}: McpCardProps) {
  const { t } = useTranslation();

  const setAuth = (patch: Partial<McpAuthData>) =>
    setSettings({ ...settings, auth: { ...(settings.auth || {}), ...patch } });
  const setBuiltin = (patch: Partial<McpBuiltinAuthData>) =>
    setAuth({ builtin: { ...(settings.auth?.builtin || {}), ...patch } });

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-host";
  const mcpUrl = `${baseUrl}/mcp`;
  const metadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
  const authMode = settings.auth?.mode || "oauth";
  const connectorUrl = settings.auth?.resourceId || mcpUrl;

  return (
    <>
      <McpConnectionPanel
        enabled={settings.enabled || false}
        mode={authMode}
        connectorUrl={connectorUrl}
      />
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={500} size="sm">
                {t("admin.settings.mcp.enabled.label", "Enable MCP Server")}{" "}
                <InfoTooltip
                  label={t(
                    "admin.settings.mcp.enabled.description",
                    "When off (default), no /mcp endpoint, metadata, or MCP beans are loaded.",
                  )}
                />
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
                <InfoTooltip
                  label={t(
                    "admin.settings.mcp.mode.description",
                    "Built-in runs Stirling's own OAuth server with no IdP - the mode ChatGPT and the claude.ai connector need. OAuth uses an external IdP. API key uses a Stirling per-user key (X-API-KEY) and publishes no OAuth metadata.",
                  )}
                />
              </Group>
            }
            data={[
              {
                value: "builtin",
                label: t(
                  "admin.settings.mcp.mode.builtin",
                  "Built-in OAuth 2.1",
                ),
              },
              {
                value: "oauth",
                label: t(
                  "admin.settings.mcp.mode.oauth",
                  "OAuth 2.1 (external IdP)",
                ),
              },
              {
                value: "apikey",
                label: t(
                  "admin.settings.mcp.mode.apikey",
                  "API key (Stirling per-user key)",
                ),
              },
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

          {authMode !== "apikey" && (
            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t("admin.settings.mcp.resourceId.label", "Resource ID")}
                  </span>
                  <PendingBadge show={isFieldPending("auth.resourceId")} />
                  <InfoTooltip
                    label={t(
                      "admin.settings.mcp.resourceId.description",
                      "This server's public /mcp URL. Tokens must list it in their audience (RFC 8707) or they are rejected.",
                    )}
                  />
                </Group>
              }
              value={settings.auth?.resourceId || ""}
              onChange={(e) => setAuth({ resourceId: e.target.value })}
              placeholder={mcpUrl}
              disabled={!settings.enabled}
            />
          )}

          {authMode === "builtin" && (
            <McpBuiltinFields
              builtin={settings.auth?.builtin || {}}
              onChange={setBuiltin}
              isFieldPending={isFieldPending}
              disabled={!settings.enabled}
            />
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
                    <InfoTooltip
                      label={t(
                        "admin.settings.mcp.issuerUri.description",
                        "Your OAuth2 authorization server (must publish /.well-known/openid-configuration). Required when enabled.",
                      )}
                    />
                  </Group>
                }
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
                        "admin.settings.mcp.acceptedAudiences.label",
                        "Additional accepted audiences (optional)",
                      )}
                    </span>
                    <PendingBadge
                      show={isFieldPending("auth.acceptedAudiences")}
                    />
                    <InfoTooltip
                      label={t(
                        "admin.settings.mcp.acceptedAudiences.description",
                        "Extra token audience values accepted besides the Resource ID (comma or space separated). Leave blank for strict RFC 8707. Needed for IdPs that cannot mint resource audiences - e.g. Supabase's OAuth server always issues aud=authenticated.",
                      )}
                    />
                  </Group>
                }
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
                    <InfoTooltip
                      label={t(
                        "admin.settings.mcp.jwksUri.description",
                        "Leave blank to discover it from the issuer. Set only if your IdP serves keys at a non-standard URL.",
                      )}
                    />
                  </Group>
                }
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
                    )}{" "}
                    <InfoTooltip
                      label={t(
                        "admin.settings.mcp.scopes.description",
                        "Require mcp.tools.read for read ops and mcp.tools.write for write/AI ops.",
                      )}
                    />
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
                    )}{" "}
                    <InfoTooltip
                      label={t(
                        "admin.settings.mcp.requireAccount.description",
                        "Only let tokens through if their subject maps to a provisioned, enabled Stirling user.",
                      )}
                    />
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
                    <PendingBadge show={isFieldPending("auth.usernameClaim")} />
                    <InfoTooltip
                      label={t(
                        "admin.settings.mcp.usernameClaim.description",
                        "JWT claim matched against a Stirling username (e.g. sub, email, preferred_username).",
                      )}
                    />
                  </Group>
                }
                value={settings.auth?.usernameClaim || ""}
                onChange={(e) => setAuth({ usernameClaim: e.target.value })}
                placeholder="sub"
                disabled={!settings.enabled}
              />
            </>
          )}

          <McpResultsFields
            settings={settings}
            onChange={(patch) => setSettings({ ...settings, ...patch })}
            isFieldPending={isFieldPending}
            parseList={parseOpList}
          />

          <Textarea
            label={
              <Group gap="xs">
                <span>
                  {t("admin.settings.mcp.allowedOps.label", "Allowed tools")}
                </span>
                <PendingBadge show={isFieldPending("allowedOperations")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.mcp.allowedOps.description",
                    "If set, ONLY these operation ids are exposed (an allow-list; comma or space separated). Leave blank to expose all enabled tools except any blocked below.",
                  )}
                />
              </Group>
            }
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
                <InfoTooltip
                  label={t(
                    "admin.settings.mcp.blockedOps.description",
                    "Operation ids to hide from MCP (comma or space separated), e.g. add-password remove-password. Leave blank to expose all enabled tools.",
                  )}
                />
              </Group>
            }
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

      <McpGuide
        mode={authMode}
        mcpUrl={connectorUrl}
        metadataUrl={metadataUrl}
      />
    </>
  );
}
