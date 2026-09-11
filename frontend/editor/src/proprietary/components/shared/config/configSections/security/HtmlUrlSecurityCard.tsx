import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import {
  Stack,
  Paper,
  Text,
  Group,
  Select,
  Accordion,
  Textarea,
} from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type { SecurityCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/** Where HTML-to-PDF conversions are allowed to fetch from (SSRF guard). */
export function HtmlUrlSecurityCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: SecurityCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <SettingsToggleRow
          label={t(
            "admin.settings.security.htmlUrlSecurity.enabled.label",
            "Enable URL Security",
          )}
          info={t(
            "admin.settings.security.htmlUrlSecurity.enabled.description",
            "Enable URL security restrictions for HTML to PDF conversions",
          )}
          pending={isFieldPending("html.urlSecurity.enabled")}
          checked={settings?.html?.urlSecurity?.enabled || false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              html: {
                ...settings?.html,
                urlSecurity: {
                  ...settings?.html?.urlSecurity,
                  enabled: checked,
                },
              },
            })
          }
          disabled={!loginEnabled}
        />

        <div>
          <Select
            name="html_urlSecurity_level"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.htmlUrlSecurity.level.label",
                    "Security Level",
                  )}
                </span>
                <PendingBadge show={isFieldPending("html.urlSecurity.level")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.htmlUrlSecurity.level.description",
                    "MAX: whitelist only, MEDIUM: block internal networks, OFF: no restrictions",
                  )}
                />
              </Group>
            }
            value={settings?.html?.urlSecurity?.level || "MEDIUM"}
            onChange={(value) =>
              setSettings({
                ...settings,
                html: {
                  ...settings?.html,
                  urlSecurity: {
                    ...settings?.html?.urlSecurity,
                    level: value || "MEDIUM",
                  },
                },
              })
            }
            data={[
              {
                value: "MAX",
                label: t(
                  "admin.settings.security.htmlUrlSecurity.level.max",
                  "Maximum (Whitelist Only)",
                ),
              },
              {
                value: "MEDIUM",
                label: t(
                  "admin.settings.security.htmlUrlSecurity.level.medium",
                  "Medium (Block Internal)",
                ),
              },
              {
                value: "OFF",
                label: t(
                  "admin.settings.security.htmlUrlSecurity.level.off",
                  "Off (No Restrictions)",
                ),
              },
            ]}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
            disabled={!loginEnabled}
          />
        </div>

        <Accordion variant="separated">
          <Accordion.Item value="advanced">
            <Accordion.Control>
              {t(
                "admin.settings.security.htmlUrlSecurity.advanced",
                "Advanced Settings",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                {/* Allowed Domains */}
                <div>
                  <Textarea
                    name="html_urlSecurity_allowedDomains"
                    label={
                      <Group component="span" gap="xs">
                        <span>
                          {t(
                            "admin.settings.security.htmlUrlSecurity.allowedDomains.label",
                            "Allowed Domains (Whitelist)",
                          )}
                        </span>
                        <PendingBadge
                          show={isFieldPending(
                            "html.urlSecurity.allowedDomains",
                          )}
                        />
                        <InfoTooltip
                          label={t(
                            "admin.settings.security.htmlUrlSecurity.allowedDomains.description",
                            "One domain per line (e.g., cdn.example.com). Only these domains allowed when level is MAX",
                          )}
                        />
                      </Group>
                    }
                    value={
                      settings?.html?.urlSecurity?.allowedDomains?.join("\n") ||
                      ""
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        html: {
                          ...settings?.html,
                          urlSecurity: {
                            ...settings?.html?.urlSecurity,
                            allowedDomains: e.target.value
                              ? e.target.value
                                  .split("\n")
                                  .filter((d) => d.trim())
                              : [],
                          },
                        },
                      })
                    }
                    placeholder="cdn.example.com&#10;images.google.com"
                    minRows={3}
                    autosize
                    disabled={!loginEnabled}
                  />
                </div>

                {/* Blocked Domains */}
                <div>
                  <Textarea
                    name="html_urlSecurity_blockedDomains"
                    label={
                      <Group component="span" gap="xs">
                        <span>
                          {t(
                            "admin.settings.security.htmlUrlSecurity.blockedDomains.label",
                            "Blocked Domains (Blacklist)",
                          )}
                        </span>
                        <PendingBadge
                          show={isFieldPending(
                            "html.urlSecurity.blockedDomains",
                          )}
                        />
                        <InfoTooltip
                          label={t(
                            "admin.settings.security.htmlUrlSecurity.blockedDomains.description",
                            "One domain per line (e.g., malicious.com). Additional domains to block",
                          )}
                        />
                      </Group>
                    }
                    value={
                      settings?.html?.urlSecurity?.blockedDomains?.join("\n") ||
                      ""
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        html: {
                          ...settings?.html,
                          urlSecurity: {
                            ...settings?.html?.urlSecurity,
                            blockedDomains: e.target.value
                              ? e.target.value
                                  .split("\n")
                                  .filter((d) => d.trim())
                              : [],
                          },
                        },
                      })
                    }
                    placeholder="malicious.com&#10;evil.org"
                    minRows={3}
                    autosize
                    disabled={!loginEnabled}
                  />
                </div>

                {/* Internal TLDs */}
                <div>
                  <Textarea
                    name="html_urlSecurity_internalTlds"
                    label={
                      <Group component="span" gap="xs">
                        <span>
                          {t(
                            "admin.settings.security.htmlUrlSecurity.internalTlds.label",
                            "Internal TLDs",
                          )}
                        </span>
                        <PendingBadge
                          show={isFieldPending("html.urlSecurity.internalTlds")}
                        />
                        <InfoTooltip
                          label={t(
                            "admin.settings.security.htmlUrlSecurity.internalTlds.description",
                            "One TLD per line (e.g., .local, .internal). Block domains with these TLD patterns",
                          )}
                        />
                      </Group>
                    }
                    value={
                      settings?.html?.urlSecurity?.internalTlds?.join("\n") ||
                      ""
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        html: {
                          ...settings?.html,
                          urlSecurity: {
                            ...settings?.html?.urlSecurity,
                            internalTlds: e.target.value
                              ? e.target.value
                                  .split("\n")
                                  .filter((d) => d.trim())
                              : [],
                          },
                        },
                      })
                    }
                    placeholder=".local&#10;.internal&#10;.corp&#10;.home"
                    minRows={3}
                    autosize
                    disabled={!loginEnabled}
                  />
                </div>

                {/* Network Blocking Options */}
                <Text fw={600} size="sm" mt="md">
                  {t(
                    "admin.settings.security.htmlUrlSecurity.networkBlocking",
                    "Network Blocking",
                  )}
                </Text>

                <SettingsToggleRow
                  label={t(
                    "admin.settings.security.htmlUrlSecurity.blockPrivateNetworks.label",
                    "Block Private Networks",
                  )}
                  info={t(
                    "admin.settings.security.htmlUrlSecurity.blockPrivateNetworks.description",
                    "Block RFC 1918 private networks (10.x.x.x, 192.168.x.x, 172.16-31.x.x)",
                  )}
                  pending={isFieldPending(
                    "html.urlSecurity.blockPrivateNetworks",
                  )}
                  checked={
                    settings?.html?.urlSecurity?.blockPrivateNetworks || false
                  }
                  onChange={(checked) =>
                    setSettings({
                      ...settings,
                      html: {
                        ...settings?.html,
                        urlSecurity: {
                          ...settings?.html?.urlSecurity,
                          blockPrivateNetworks: checked,
                        },
                      },
                    })
                  }
                  disabled={!loginEnabled}
                />

                <SettingsToggleRow
                  label={t(
                    "admin.settings.security.htmlUrlSecurity.blockLocalhost.label",
                    "Block Localhost",
                  )}
                  info={t(
                    "admin.settings.security.htmlUrlSecurity.blockLocalhost.description",
                    "Block localhost and loopback addresses (127.x.x.x, ::1)",
                  )}
                  pending={isFieldPending("html.urlSecurity.blockLocalhost")}
                  checked={settings?.html?.urlSecurity?.blockLocalhost || false}
                  onChange={(checked) =>
                    setSettings({
                      ...settings,
                      html: {
                        ...settings?.html,
                        urlSecurity: {
                          ...settings?.html?.urlSecurity,
                          blockLocalhost: checked,
                        },
                      },
                    })
                  }
                  disabled={!loginEnabled}
                />

                <SettingsToggleRow
                  label={t(
                    "admin.settings.security.htmlUrlSecurity.blockLinkLocal.label",
                    "Block Link-Local Addresses",
                  )}
                  info={t(
                    "admin.settings.security.htmlUrlSecurity.blockLinkLocal.description",
                    "Block link-local addresses (169.254.x.x, fe80::/10)",
                  )}
                  pending={isFieldPending("html.urlSecurity.blockLinkLocal")}
                  checked={settings?.html?.urlSecurity?.blockLinkLocal || false}
                  onChange={(checked) =>
                    setSettings({
                      ...settings,
                      html: {
                        ...settings?.html,
                        urlSecurity: {
                          ...settings?.html?.urlSecurity,
                          blockLinkLocal: checked,
                        },
                      },
                    })
                  }
                  disabled={!loginEnabled}
                />

                <SettingsToggleRow
                  label={t(
                    "admin.settings.security.htmlUrlSecurity.blockCloudMetadata.label",
                    "Block Cloud Metadata Endpoints",
                  )}
                  info={t(
                    "admin.settings.security.htmlUrlSecurity.blockCloudMetadata.description",
                    "Block cloud provider metadata endpoints (169.254.169.254)",
                  )}
                  pending={isFieldPending(
                    "html.urlSecurity.blockCloudMetadata",
                  )}
                  checked={
                    settings?.html?.urlSecurity?.blockCloudMetadata || false
                  }
                  onChange={(checked) =>
                    setSettings({
                      ...settings,
                      html: {
                        ...settings?.html,
                        urlSecurity: {
                          ...settings?.html?.urlSecurity,
                          blockCloudMetadata: checked,
                        },
                      },
                    })
                  }
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Paper>
  );
}
