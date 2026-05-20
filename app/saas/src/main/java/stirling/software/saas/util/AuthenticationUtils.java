package stirling.software.saas.util;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;

/**
 * Utility class for extracting information from authentication objects. Provides consistent access
 * to user identifiers across different authentication types.
 */
public class AuthenticationUtils {

    private AuthenticationUtils() {
        // Utility class - no instances
    }

    /**
     * Extract the Supabase ID from an authentication object for credit operations and user lookups.
     *
     * @param authentication The authentication object
     * @return The Supabase ID for JWT users, or API key for API key users
     */
    public static String extractSupabaseId(Authentication authentication) {
        if (authentication instanceof EnhancedJwtAuthenticationToken enhancedJwt) {
            return enhancedJwt.getSupabaseId();
        } else if (authentication instanceof ApiKeyAuthenticationToken) {
            // For API key authentication, the name is the API key
            return authentication.getName();
        }
        // Fallback for other authentication types
        return authentication.getName();
    }

    /**
     * Extract the email from an authentication object for audit and display purposes.
     *
     * @param authentication The authentication object
     * @return The user's email or fallback identifier
     */
    public static String extractEmail(Authentication authentication) {
        if (authentication instanceof EnhancedJwtAuthenticationToken enhancedJwt) {
            return enhancedJwt.getEmail();
        }
        // For other types, getName() should return the appropriate identifier
        return authentication.getName();
    }

    /**
     * Get the current User from an authentication object, looking it up in the database if needed.
     *
     * @param authentication The authentication object
     * @param userRepository Repository to look up users
     * @return The authenticated User
     * @throws SecurityException if user cannot be resolved
     */
    public static User getCurrentUser(
            Authentication authentication, UserRepository userRepository) {
        if (authentication == null) {
            throw new SecurityException("Not authenticated");
        }

        Object principal = authentication.getPrincipal();

        // Direct User object (from custom filter)
        if (principal instanceof User) {
            return (User) principal;
        }

        // Handle EnhancedJwtAuthenticationToken (includes anonymous users)
        // Use Supabase ID lookup which works for all JWT users
        if (authentication instanceof EnhancedJwtAuthenticationToken) {
            String supabaseId = extractSupabaseId(authentication);
            try {
                java.util.UUID supabaseUuid = java.util.UUID.fromString(supabaseId);
                return userRepository
                        .findBySupabaseId(supabaseUuid)
                        .orElseThrow(() -> new SecurityException("User not found"));
            } catch (IllegalArgumentException e) {
                throw new SecurityException("Invalid Supabase ID format: " + supabaseId);
            }
        }

        // String username/email
        if (principal instanceof String) {
            return userRepository
                    .findByUsername((String) principal)
                    .orElseThrow(() -> new SecurityException("User not found"));
        }

        // Jwt principal from oauth2ResourceServer
        if (principal instanceof Jwt jwt) {
            String email = jwt.getClaimAsString("email");
            if (email != null) {
                return userRepository
                        .findByUsername(email)
                        .orElseThrow(() -> new SecurityException("User not found"));
            }
        }

        throw new SecurityException(
                "Invalid authentication principal: " + principal.getClass().getName());
    }
}
