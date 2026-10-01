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
import type { SecuritySettingsData } from "@app/components/shared/config/configSections/security/securitySettingsTypes";

type UrlSecurity = NonNullable<
  NonNullable<SecuritySettingsData["html"]>["urlSecurity"]
>;

/** Where HTML-to-PDF conversions are allowed to fetch from (SSRF guard). */
export function HtmlUrlSecurityCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: SecurityCardProps) {
  const { t } = useTranslation();
  const urlSecurity = settings?.html?.urlSecurity;

  function updateUrlSecurity(patch: Partial<UrlSecurity>) {
    setSettings({
      ...settings,
      html: {
        ...settings?.html,
        urlSecurity: { ...urlSecurity, ...patch },
      },
    });
  }

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
          checked={urlSecurity?.enabled || false}
          onChange={(checked) => updateUrlSecurity({ enabled: checked })}
          disabled={!loginEnabled}
        />

        <div>
          <Select
            name="html_urlSecurity_level"
            label={
              <UrlSecurityFieldLabel
                label={t(
                  "admin.settings.security.htmlUrlSecurity.level.label",
                  "Security Level",
                )}
                info={t(
                  "admin.settings.security.htmlUrlSecurity.level.description",
                  "MAX: whitelist only, MEDIUM: block internal networks, OFF: no restrictions",
                )}
                pending={isFieldPending("html.urlSecurity.level")}
              />
            }
            value={urlSecurity?.level || "MEDIUM"}
            onChange={(value) =>
              updateUrlSecurity({ level: value || "MEDIUM" })
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
              <AdvancedUrlSecurityFields
                urlSecurity={urlSecurity}
                onChange={updateUrlSecurity}
                isFieldPending={isFieldPending}
                disabled={!loginEnabled}
              />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Paper>
  );
}

interface AdvancedUrlSecurityFieldsProps {
  urlSecurity: UrlSecurity | undefined;
  onChange: (patch: Partial<UrlSecurity>) => void;
  isFieldPending: (field: string) => boolean;
  disabled: boolean;
}

function AdvancedUrlSecurityFields({
  urlSecurity,
  onChange,
  isFieldPending,
  disabled,
}: AdvancedUrlSecurityFieldsProps) {
  const { t } = useTranslation();
  return (
    <Stack gap="md">
      <DomainListField
        name="html_urlSecurity_allowedDomains"
        label={t(
          "admin.settings.security.htmlUrlSecurity.allowedDomains.label",
          "Allowed Domains (Whitelist)",
        )}
        info={t(
          "admin.settings.security.htmlUrlSecurity.allowedDomains.description",
          "One domain per line (e.g., cdn.example.com). Only these domains allowed when level is MAX",
        )}
        pending={isFieldPending("html.urlSecurity.allowedDomains")}
        value={urlSecurity?.allowedDomains}
        onChange={(allowedDomains) => onChange({ allowedDomains })}
        placeholder="cdn.example.com&#10;images.google.com"
        disabled={disabled}
      />

      <DomainListField
        name="html_urlSecurity_blockedDomains"
        label={t(
          "admin.settings.security.htmlUrlSecurity.blockedDomains.label",
          "Blocked Domains (Blacklist)",
        )}
        info={t(
          "admin.settings.security.htmlUrlSecurity.blockedDomains.description",
          "One domain per line (e.g., malicious.com). Additional domains to block",
        )}
        pending={isFieldPending("html.urlSecurity.blockedDomains")}
        value={urlSecurity?.blockedDomains}
        onChange={(blockedDomains) => onChange({ blockedDomains })}
        placeholder="malicious.com&#10;evil.org"
        disabled={disabled}
      />

      <DomainListField
        name="html_urlSecurity_internalTlds"
        label={t(
          "admin.settings.security.htmlUrlSecurity.internalTlds.label",
          "Internal TLDs",
        )}
        info={t(
          "admin.settings.security.htmlUrlSecurity.internalTlds.description",
          "One TLD per line (e.g., .local, .internal). Block domains with these TLD patterns",
        )}
        pending={isFieldPending("html.urlSecurity.internalTlds")}
        value={urlSecurity?.internalTlds}
        onChange={(internalTlds) => onChange({ internalTlds })}
        placeholder=".local&#10;.internal&#10;.corp&#10;.home"
        disabled={disabled}
      />

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
        pending={isFieldPending("html.urlSecurity.blockPrivateNetworks")}
        checked={urlSecurity?.blockPrivateNetworks || false}
        onChange={(checked) => onChange({ blockPrivateNetworks: checked })}
        disabled={disabled}
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
        checked={urlSecurity?.blockLocalhost || false}
        onChange={(checked) => onChange({ blockLocalhost: checked })}
        disabled={disabled}
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
        checked={urlSecurity?.blockLinkLocal || false}
        onChange={(checked) => onChange({ blockLinkLocal: checked })}
        disabled={disabled}
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
        pending={isFieldPending("html.urlSecurity.blockCloudMetadata")}
        checked={urlSecurity?.blockCloudMetadata || false}
        onChange={(checked) => onChange({ blockCloudMetadata: checked })}
        disabled={disabled}
      />
    </Stack>
  );
}

function UrlSecurityFieldLabel({
  label,
  info,
  pending,
}: {
  label: string;
  info: string;
  pending: boolean;
}) {
  return (
    <Group component="span" gap="xs">
      <span>{label}</span>
      <PendingBadge show={pending} />
      <InfoTooltip label={info} />
    </Group>
  );
}

interface DomainListFieldProps {
  name: string;
  label: string;
  info: string;
  pending: boolean;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
  placeholder: string;
  disabled: boolean;
}

function DomainListField({
  name,
  label,
  info,
  pending,
  value,
  onChange,
  placeholder,
  disabled,
}: DomainListFieldProps) {
  return (
    <div>
      <Textarea
        name={name}
        label={
          <UrlSecurityFieldLabel label={label} info={info} pending={pending} />
        }
        value={value?.join("\n") || ""}
        onChange={(e) =>
          onChange(e.target.value.split("\n").filter((line) => line.trim()))
        }
        placeholder={placeholder}
        minRows={3}
        autosize
        disabled={disabled}
      />
    </div>
  );
}
