package stirling.software.proprietary.security.service;

import java.util.Map;

import org.springframework.security.core.Authentication;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public interface JwtServiceInterface {

    /**
     * Generate a JWT token for the authenticated user
     *
     * @param authentication Spring Security authentication object
     * @return JWT token as a string
     */
    String generateToken(Authentication authentication, Map<String, Object> claims);

    /**
     * Generate a JWT token for a specific username
     *
     * @param username the username for which to generate the token
     * @param claims additional claims to include in the token
     * @return JWT token as a string
     */
    String generateToken(String username, Map<String, Object> claims);

    /**
     * Validate a JWT token
     *
     * @param token the JWT token to validate
     * @return true if token is valid, false otherwise
     */
    void validateToken(String token);

    /**
     * Extract username from JWT token
     *
     * @param token the JWT token
     * @return username extracted from token
     */
    String extractUsername(String token);

    /**
     * Extract all claims from JWT token
     *
     * @param token the JWT token
     * @return map of claims
     */
    Map<String, Object> extractClaims(String token);

    /**
     * Check if token is expired
     *
     * @param token the JWT token
     * @return true if token is expired, false otherwise
     */
    boolean isTokenExpired(String token);

    /**
     * Extract JWT token from HTTP request (header or cookie)
     *
     * @param request HTTP servlet request
     * @return JWT token if found, null otherwise
     */
    String extractToken(HttpServletRequest request);

    /**
     * Check if JWT authentication is enabled
     *
     * @return true if JWT is enabled, false otherwise
     */
    boolean isJwtEnabled();

    /**
     * Sets JWT as an HttpOnly cookie for security. Prevents XSS attacks by making token
     * inaccessible to JavaScript.
     *
     * @param response HTTP response to set cookie
     * @param jwt JWT token to store
     * @param contextPath Application context path for cookie path
     */
    void setJwtCookie(HttpServletResponse response, String jwt, String contextPath);

    /**
     * Sets refresh token as an HttpOnly cookie for security.
     *
     * @param response HTTP response to set cookie
     * @param refreshToken Refresh token to store
     * @param contextPath Application context path for cookie path
     * @param maxAge Maximum age in seconds
     */
    void setRefreshTokenCookie(
            HttpServletResponse response, String refreshToken, String contextPath, int maxAge);

    /**
     * Removes JWT cookie from the response (used for logout).
     *
     * @param response HTTP response to remove cookie
     * @param contextPath Application context path for cookie path
     */
    void removeJwtCookie(HttpServletResponse response, String contextPath);

    /**
     * Removes refresh token cookie from the response (used for logout).
     *
     * @param response HTTP response to remove cookie
     * @param contextPath Application context path for cookie path
     */
    void removeRefreshTokenCookie(HttpServletResponse response, String contextPath);

    /**
     * Gets the configured secureCookie flag.
     *
     * @return true if cookies should be set with Secure flag, false otherwise
     */
    boolean isSecureCookie();
}
