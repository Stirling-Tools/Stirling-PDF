import { useMemo } from "react";
import { ActionIcon } from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";

import { PluginInfo } from "@app/contexts/PluginRegistryContext";

interface PluginViewerOverlayProps {
  plugin: PluginInfo;
  onClose: () => void;
}

export default function PluginViewerOverlay({
  plugin,
  onClose,
}: PluginViewerOverlayProps) {
  const { t } = useTranslation();

  const iframeSrc = useMemo(() => plugin.frontendUrl ?? "", [plugin.frontendUrl]);

  if (!iframeSrc) {
    return null;
  }

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(6, 8, 12, 0.92)",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    zIndex: 5000,
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1rem",
    color: "var(--text-on-dark, white)",
  };

  const titleStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: "1.25rem",
  };

  const subtitleStyle: React.CSSProperties = {
    opacity: 0.85,
    fontSize: "0.9rem",
  };

  const iframeStyle: React.CSSProperties = {
    flex: 1,
    width: "100%",
    border: "none",
    borderRadius: "0.75rem",
    background: "#05070a",
  };

  return createPortal(
    <div style={overlayStyle}>
      <div style={headerStyle}>
        <div>
          <div style={titleStyle}>{plugin.name}</div>
          <div style={subtitleStyle}>
            {plugin.description || t("plugins.noDescription", "No description provided.")}
          </div>
        </div>
        <ActionIcon
          variant="light"
          size="lg"
          onClick={onClose}
          aria-label={t("plugins.closeViewer", "Close plugin viewer")}
        >
          <LocalIcon icon="close-rounded" width="1.1rem" height="1.1rem" />
        </ActionIcon>
      </div>

      <iframe
        src={iframeSrc}
        title={plugin.name}
        style={iframeStyle}
        allowFullScreen
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
      />
    </div>,
    document.body
  );
}
