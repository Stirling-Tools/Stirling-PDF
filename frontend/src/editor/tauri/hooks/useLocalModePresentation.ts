import { useTranslation } from "react-i18next";

export interface LocalModePresentation {
  /** Connection badge while no server is connected. */
  label: string;
  description: string;
  /** Whether a failed server connection may fall back to working without one. */
  offersLocalTools: boolean;
}

/**
 * How the app presents the "local" connection mode. Here the bundled backend
 * serves it, so it is a working mode of its own; a platform without one shadows
 * this to present it as simply not connected.
 */
export function useLocalModePresentation(): LocalModePresentation {
  const { t } = useTranslation();
  return {
    label: t("settings.connection.mode.local", "Local Only"),
    description: t(
      "settings.connection.localDescription",
      "You are using the local backend without an account. Some tools requiring cloud processing or a self-hosted server are unavailable.",
    ),
    offersLocalTools: true,
  };
}
