import React from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

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

/** Brand marks (simple-icons paths) so each option shows its real OS logo. */
const OS_ICON_PATHS: Record<string, string> = {
  apple:
    "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701",
  windows:
    "M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801",
  linux:
    "M14.62 8.35c-.18.11-.4.28-.66.35-.24.08-.5.16-.72.16-.4 0-.72-.13-.98-.28-.16-.09-.29-.19-.4-.28l-.08-.06a.29.29 0 0 0-.34.02.28.28 0 0 0-.05.4c.02.02.16.16.4.3.24.16.6.32 1.05.32.34 0 .66-.08.94-.18.28-.1.5-.22.68-.34.42-.28.68-.6.68-.6a.28.28 0 0 0-.06-.4.29.29 0 0 0-.4.06s-.2.26-.53.45zM9.36 6.6c.35 0 .63.32.63.72s-.28.72-.63.72c-.35 0-.63-.32-.63-.72s.28-.72.63-.72zm5.3 0c.35 0 .63.32.63.72s-.28.72-.63.72c-.35 0-.63-.32-.63-.72s.28-.72.63-.72zM12 0C6.9 0 4.28 3.98 4.34 7.66c.06 3.68-.9 4.98-1.72 6.28C1.8 15.24.9 16.4.9 18.1c0 .96.4 1.6 1 2 .6.4 1.36.5 2.1.6.74.1 1.46.2 2 .5.54.3.9.8 1.7.9.4.06.86 0 1.3-.2.44-.2.86-.54 1.16-1.06h1.68c.3.52.72.86 1.16 1.06.44.2.9.26 1.3.2.8-.1 1.16-.6 1.7-.9.54-.3 1.26-.4 2-.5.74-.1 1.5-.2 2.1-.6.6-.4 1-1.04 1-2 0-1.7-.9-2.86-1.72-4.16-.82-1.3-1.78-2.6-1.72-6.28C19.72 3.98 17.1 0 12 0z",
};

/** Map an OS option to its brand-icon key from its value/label. */
function osIconKey(option: OSOption): string | null {
  const text = `${option.value} ${option.label}`.toLowerCase();
  if (/(mac|apple|osx|darwin)/.test(text)) return "apple";
  if (/win/.test(text)) return "windows";
  if (/linux/.test(text)) return "linux";
  return null;
}

function OsIcon({ os }: { os: string }) {
  const d = OS_ICON_PATHS[os];
  if (!d) return null;
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
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
            <ExpandMoreIcon fontSize="small" />
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
                    ? "var(--bg-muted, #f1f5f9)"
                    : "transparent",
                  color: "var(--onboarding-title, #0f172a)",
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
