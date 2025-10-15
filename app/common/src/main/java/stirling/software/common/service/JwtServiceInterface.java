package stirling.software.common.service;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Service interface for JWT token operations. Implementations handle token generation, validation,
 * and extraction.
 */
public interface JwtServiceInterface {

    /**
     * Generates a JWT token from an Authentication object. The authentication parameter is Object
     * to avoid dependencies on Spring Security. Implementations should expect
     * org.springframework.security.core.Authentication.
     *
     * @param authentication the authentication object (Spring Security Authentication)
     * @param claims additional claims to include in the token
     * @return the generated JWT token
     */
    String generateToken(Object authentication, Map<String, Object> claims);

    /**
     * Generates a JWT token from a username.
     *
     * @param username the username
     * @param claims additional claims to include in the token
     * @return the generated JWT token
     */
    String generateToken(String username, Map<String, Object> claims);

    /**
     * Validates a JWT token.
     *
     * @param token the token to validate
     * @throws RuntimeException if token is invalid or expired
     */
    void validateToken(String token);

    /**
     * Extracts the username from a JWT token.
     *
     * @param token the JWT token
     * @return the username
     */
    String extractUsername(String token);

    /**
     * Extracts all claims from a JWT token.
     *
     * @param token the JWT token
     * @return map of claim keys to values
     */
    Map<String, Object> extractClaims(String token);

    /**
     * Checks if a JWT token is expired.
     *
     * @param token the JWT token
     * @return true if expired, false otherwise
     */
    boolean isTokenExpired(String token);

    /**
     * Extracts the JWT token from an HTTP request cookie.
     *
     * @param request the HTTP request
     * @return the JWT token, or null if not found
     */
    String extractToken(HttpServletRequest request);

    /**
     * Adds a JWT token to the HTTP response as a cookie.
     *
     * @param response the HTTP response
     * @param token the JWT token to add
     */
    void addToken(HttpServletResponse response, String token);

    /**
     * Clears the JWT token cookie from the HTTP response.
     *
     * @param response the HTTP response
     */
    void clearToken(HttpServletResponse response);

    /**
     * Checks if JWT authentication is enabled.
     *
     * @return true if enabled, false otherwise
     */
    boolean isJwtEnabled();
}
