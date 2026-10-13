import React from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
export interface OSOption {
  label: string;
  url: string;
  value: string;
}

interface DesktopInstallTitleProps {
  osLabel: string;
  osUrl: string;
  osOptions: OSOption[];
  onDownloadUrlChange?: (url: string) => void;
}

/** Map an OS option to its brand-icon key from its value/label. */
function osIconKey(option: OSOption): OsIconName | null {
  const text = `${option.value} ${option.label}`.toLowerCase();
  if (/(mac|apple|osx|darwin)/.test(text)) return "apple";
  if (/win/.test(text)) return "windows";
  if (/linux/.test(text)) return "linux";
  return null;
}

type OsIconName = "apple" | "windows" | "linux";

function OsIcon({ os }: { os: OsIconName }) {
  return <Icon name={os} size={16} />;
}

export const DesktopInstallTitle: React.FC<DesktopInstallTitleProps> = ({
  osLabel,
  osUrl,
  osOptions,
  onDownloadUrlChange,
}) => {
  const { t } = useTranslation();
  const [selectedOsUrl, setSelectedOsUrl] = React.useState<string>(osUrl);

  React.useEffect(() => {
    setSelectedOsUrl(osUrl);
  }, [osUrl]);

  const handleOsSelect = React.useCallback(
    (option: OSOption) => {
      setSelectedOsUrl(option.url);
      onDownloadUrlChange?.(option.url);
    },
    [onDownloadUrlChange],
  );

  const currentOsOption =
    osOptions.find((opt) => opt.url === selectedOsUrl) ||
    (osOptions.length > 0 ? osOptions[0] : { label: osLabel, url: osUrl });

  const displayLabel = currentOsOption.label || osLabel;
  const title = displayLabel
    ? t("onboarding.desktopInstall.titleWithOs", "Download for {{osLabel}}", {
        osLabel: displayLabel,
      })
    : t("onboarding.desktopInstall.title", "Download");

  // If only one option or no options, don't show dropdown
  if (osOptions.length <= 1) {
    return <div style={{ width: "100%" }}>{title}</div>;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        width: "100%",
      }}
    >
      <span style={{ whiteSpace: "nowrap" }}>{title}</span>
      <Menu position="bottom-start" offset={5} zIndex={10000}>
        <Menu.Target>
          <ActionIcon
            variant="tertiary"
            size="sm"
            aria-label={t(
              "onboarding.desktopInstall.selectOs",
              "Select operating system",
            )}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              padding: 0,
            }}
          >
            <Icon name="chevron-down" size={20} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {osOptions.map((option) => {
            const isSelected = option.url === selectedOsUrl;
            const iconKey = osIconKey(option);
            return (
              <Menu.Item
                key={option.url}
                onClick={() => handleOsSelect(option)}
                leftSection={iconKey ? <OsIcon os={iconKey} /> : undefined}
                style={{
                  backgroundColor: isSelected
                    ? "var(--c-surface-sunken, #f1f5f9)"
                    : "transparent",
                  color: "var(--c-text, #0f172a)",
                  fontWeight: isSelected ? 600 : 500,
                }}
              >
                {option.label}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
};
