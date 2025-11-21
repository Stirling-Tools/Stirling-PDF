package stirling.software.proprietary.security.util;

import org.springframework.http.ResponseCookie;

/**
 * Utility class for creating secure JWT cookies.
 *
 * <p>Provides methods to create HttpOnly, SameSite cookies for JWT tokens with configurable
 * security settings.
 */
public class CookieUtils {

    public static final String JWT_COOKIE_NAME = "stirling_jwt";
    public static final String REFRESH_TOKEN_COOKIE_NAME = "stirling_refresh_token";

    // 6 hours in seconds (user requested medium-lived token)
    private static final int ACCESS_TOKEN_MAX_AGE = 21600; // 6 * 60 * 60

    // 7 days in seconds for refresh token
    private static final int REFRESH_TOKEN_MAX_AGE = 604800; // 7 * 24 * 60 * 60

    private CookieUtils() {
        // Private constructor to prevent instantiation
    }

    /**
     * Creates an access token cookie with the specified JWT.
     *
     * @param jwt The JWT token value
     * @param secure Whether to set the Secure flag (true for HTTPS, false for HTTP)
     * @return ResponseCookie configured for access token
     */
    public static ResponseCookie createAccessTokenCookie(String jwt, boolean secure) {
        return ResponseCookie.from(JWT_COOKIE_NAME, jwt)
                .httpOnly(true) // Prevents JavaScript access (XSS protection)
                .secure(secure) // Only sent over HTTPS when true
                .path("/") // Available to all paths
                .maxAge(ACCESS_TOKEN_MAX_AGE) // 6 hours
                .sameSite("Lax") // CSRF protection while allowing OAuth redirects
                .build();
    }

    /**
     * Creates a refresh token cookie with the specified token.
     *
     * @param refreshToken The refresh token value
     * @param secure Whether to set the Secure flag
     * @return ResponseCookie configured for refresh token
     */
    public static ResponseCookie createRefreshTokenCookie(String refreshToken, boolean secure) {
        return ResponseCookie.from(REFRESH_TOKEN_COOKIE_NAME, refreshToken)
                .httpOnly(true)
                .secure(secure)
                .path("/api/v1/auth/refresh") // Only sent to refresh endpoint
                .maxAge(REFRESH_TOKEN_MAX_AGE) // 7 days
                .sameSite("Lax")
                .build();
    }

    /**
     * Creates an expired cookie to clear an existing cookie.
     *
     * @param name The name of the cookie to clear
     * @return ResponseCookie with maxAge=0 to delete the cookie
     */
    public static ResponseCookie createExpiredCookie(String name) {
        return ResponseCookie.from(name, "")
                .httpOnly(true)
                .secure(true) // Always secure for deletion
                .path("/")
                .maxAge(0) // Expire immediately
                .sameSite("Lax")
                .build();
    }
}
