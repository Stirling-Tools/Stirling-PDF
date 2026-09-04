import { useTranslation } from "react-i18next";
import {
  Switch,
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
        <div>
          <Text size="xs" c="dimmed">
            {t(
              "admin.settings.security.htmlUrlSecurity.description",
              "Configure URL access restrictions for HTML processing to prevent SSRF attacks",
            )}
          </Text>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "admin.settings.security.htmlUrlSecurity.enabled.label",
                "Enable URL Security",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.security.htmlUrlSecurity.enabled.description",
                "Enable URL security restrictions for HTML to PDF conversions",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              name="html_urlSecurity_enabled"
              checked={settings?.html?.urlSecurity?.enabled || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  html: {
                    ...settings?.html,
                    urlSecurity: {
                      ...settings?.html?.urlSecurity,
                      enabled: e.target.checked,
                    },
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge show={isFieldPending("html.urlSecurity.enabled")} />
          </Group>
        </div>

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
              </Group>
            }
            description={t(
              "admin.settings.security.htmlUrlSecurity.level.description",
              "MAX: whitelist only, MEDIUM: block internal networks, OFF: no restrictions",
            )}
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
                      </Group>
                    }
                    description={t(
                      "admin.settings.security.htmlUrlSecurity.allowedDomains.description",
                      "One domain per line (e.g., cdn.example.com). Only these domains allowed when level is MAX",
                    )}
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
                      </Group>
                    }
                    description={t(
                      "admin.settings.security.htmlUrlSecurity.blockedDomains.description",
                      "One domain per line (e.g., malicious.com). Additional domains to block",
                    )}
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
                      </Group>
                    }
                    description={t(
                      "admin.settings.security.htmlUrlSecurity.internalTlds.description",
                      "One TLD per line (e.g., .local, .internal). Block domains with these TLD patterns",
                    )}
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

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={500} size="sm">
                      {t(
                        "admin.settings.security.htmlUrlSecurity.blockPrivateNetworks.label",
                        "Block Private Networks",
                      )}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {t(
                        "admin.settings.security.htmlUrlSecurity.blockPrivateNetworks.description",
                        "Block RFC 1918 private networks (10.x.x.x, 192.168.x.x, 172.16-31.x.x)",
                      )}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Switch
                      name="html_urlSecurity_blockPrivateNetworks"
                      checked={
                        settings?.html?.urlSecurity?.blockPrivateNetworks ||
                        false
                      }
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          html: {
                            ...settings?.html,
                            urlSecurity: {
                              ...settings?.html?.urlSecurity,
                              blockPrivateNetworks: e.target.checked,
                            },
                          },
                        })
                      }
                      disabled={!loginEnabled}
                    />
                    <PendingBadge
                      show={isFieldPending(
                        "html.urlSecurity.blockPrivateNetworks",
                      )}
                    />
                  </Group>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={500} size="sm">
                      {t(
                        "admin.settings.security.htmlUrlSecurity.blockLocalhost.label",
                        "Block Localhost",
                      )}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {t(
                        "admin.settings.security.htmlUrlSecurity.blockLocalhost.description",
                        "Block localhost and loopback addresses (127.x.x.x, ::1)",
                      )}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Switch
                      name="html_urlSecurity_blockLocalhost"
                      checked={
                        settings?.html?.urlSecurity?.blockLocalhost || false
                      }
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          html: {
                            ...settings?.html,
                            urlSecurity: {
                              ...settings?.html?.urlSecurity,
                              blockLocalhost: e.target.checked,
                            },
                          },
                        })
                      }
                      disabled={!loginEnabled}
                    />
                    <PendingBadge
                      show={isFieldPending("html.urlSecurity.blockLocalhost")}
                    />
                  </Group>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={500} size="sm">
                      {t(
                        "admin.settings.security.htmlUrlSecurity.blockLinkLocal.label",
                        "Block Link-Local Addresses",
                      )}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {t(
                        "admin.settings.security.htmlUrlSecurity.blockLinkLocal.description",
                        "Block link-local addresses (169.254.x.x, fe80::/10)",
                      )}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Switch
                      name="html_urlSecurity_blockLinkLocal"
                      checked={
                        settings?.html?.urlSecurity?.blockLinkLocal || false
                      }
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          html: {
                            ...settings?.html,
                            urlSecurity: {
                              ...settings?.html?.urlSecurity,
                              blockLinkLocal: e.target.checked,
                            },
                          },
                        })
                      }
                      disabled={!loginEnabled}
                    />
                    <PendingBadge
                      show={isFieldPending("html.urlSecurity.blockLinkLocal")}
                    />
                  </Group>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={500} size="sm">
                      {t(
                        "admin.settings.security.htmlUrlSecurity.blockCloudMetadata.label",
                        "Block Cloud Metadata Endpoints",
                      )}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {t(
                        "admin.settings.security.htmlUrlSecurity.blockCloudMetadata.description",
                        "Block cloud provider metadata endpoints (169.254.169.254)",
                      )}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Switch
                      name="html_urlSecurity_blockCloudMetadata"
                      checked={
                        settings?.html?.urlSecurity?.blockCloudMetadata || false
                      }
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          html: {
                            ...settings?.html,
                            urlSecurity: {
                              ...settings?.html?.urlSecurity,
                              blockCloudMetadata: e.target.checked,
                            },
                          },
                        })
                      }
                      disabled={!loginEnabled}
                    />
                    <PendingBadge
                      show={isFieldPending(
                        "html.urlSecurity.blockCloudMetadata",
                      )}
                    />
                  </Group>
                </div>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Paper>
  );
}
