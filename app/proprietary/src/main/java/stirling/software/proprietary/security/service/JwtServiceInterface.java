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
     * Add JWT token to HTTP response (header and cookie)
     *
     * @param response HTTP servlet response
     * @param token JWT token to add
     */
    void addToken(HttpServletResponse response, String token);

    /**
     * Clear JWT token from HTTP response (remove cookie)
     *
     * @param response HTTP servlet response
     */
    void clearToken(HttpServletResponse response);

    /**
     * Check if JWT authentication is enabled
     *
     * @return true if JWT is enabled, false otherwise
     */
    boolean isJwtEnabled();
}
