package stirling.software.proprietary.security.util;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.constants.JwtConstants;
import stirling.software.common.model.ApplicationProperties;

/**
 * Utility class for detecting desktop clients and determining appropriate token expiry times.
 *
 * <p>Desktop clients (Tauri, Electron) receive longer-lived tokens because:
 *
 * <ul>
 *   <li>They run on personal devices (not shared computers)
 *   <li>Tokens stored in OS-level encrypted keychain (not browser localStorage)
 *   <li>Better UX (users expect desktop apps to stay logged in)
 * </ul>
 */
@Slf4j
public class DesktopClientUtils {

    private DesktopClientUtils() {
        // Utility class - prevent instantiation
    }

    /**
     * Detect if the request is from a desktop client (Tauri app).
     *
     * @param request the HTTP request
     * @return true if desktop client, false if web browser
     */
    public static boolean isDesktopClient(HttpServletRequest request) {
        String userAgent = request.getHeader("User-Agent");

        if (userAgent == null) {
            return false;
        }

        // Tauri desktop app includes "Tauri" or "tauri-plugin" in User-Agent
        // Also check for common desktop app identifiers
        String userAgentLower = userAgent.toLowerCase();
        boolean hasTauri = userAgentLower.contains("tauri");
        boolean hasStirling = userAgentLower.contains("stirlingpdf-desktop");
        boolean hasElectron = userAgentLower.contains("electron");
        boolean isDesktop = hasTauri || hasStirling || hasElectron;

        log.debug("Desktop client detection: {} (User-Agent: {})", isDesktop, userAgent);

        return isDesktop;
    }

    /**
     * Get the configured desktop token expiry time in minutes.
     *
     * @param applicationProperties the application properties
     * @return desktop token expiry in minutes (defaults to 30 days if not configured)
     */
    public static int getDesktopTokenExpiryMinutes(ApplicationProperties applicationProperties) {
        int configuredMinutes =
                applicationProperties.getSecurity().getJwt().getDesktopTokenExpiryMinutes();
        // If not configured or invalid, default to 30 days (43200 minutes)
        return configuredMinutes > 0
                ? configuredMinutes
                : JwtConstants.DEFAULT_DESKTOP_TOKEN_EXPIRY_MINUTES;
    }

    /**
     * Get the configured web token expiry time in minutes.
     *
     * @param applicationProperties the application properties
     * @return web token expiry in minutes
     */
    public static int getWebTokenExpiryMinutes(ApplicationProperties applicationProperties) {
        int configuredMinutes =
                applicationProperties.getSecurity().getJwt().getTokenExpiryMinutes();
        return configuredMinutes > 0
                ? configuredMinutes
                : JwtConstants.DEFAULT_TOKEN_EXPIRY_MINUTES;
    }
}
