package stirling.software.SPDF.util;

public final class DesktopModeUtils {

    private DesktopModeUtils() {}

    public static boolean isDesktopMode() {
        return Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"))
                || Boolean.parseBoolean(
                        System.getenv().getOrDefault("STIRLING_PDF_TAURI_MODE", "false"))
                || Boolean.parseBoolean(System.getenv().getOrDefault("STIRLING_DESKTOP", "false"))
                || Boolean.parseBoolean(System.getenv().getOrDefault("VITE_DESKTOP", "false"));
    }
}
