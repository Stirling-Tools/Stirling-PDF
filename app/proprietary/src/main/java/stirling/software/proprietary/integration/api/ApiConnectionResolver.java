package stirling.software.proprietary.integration.api;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Dereferences a step's {@code connectionId} to a stored integration config.
 *
 * <p>Mirrors {@code S3ConnectionResolver}. When an authenticated caller is present the connection
 * must be usable by them; a background worker thread carries no {@code SecurityContext} and skips
 * that check, relying on the step having been access-checked when the policy was saved or when an
 * ad-hoc run was dispatched - see {@link IntegrationStepValidator}, which is what makes that
 * assumption true rather than merely hoped for.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ApiConnectionResolver {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final IntegrationConfigRepository connections;
    private final OwnershipService ownership;
    private final UserService userService;

    /** The raw config map for a connection of the given type. */
    public Map<String, Object> resolveConfig(Long connectionId, IntegrationType type) {
        IntegrationConfig connection =
                connections
                        .findById(connectionId)
                        .filter(cfg -> cfg.getIntegrationType() == type)
                        .filter(this::usableByCurrentUser)
                        // Existence and access collapse into one error so a caller cannot tell
                        // "no such connection" from "someone else's connection" and enumerate ids.
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "unknown or inaccessible "
                                                        + type.name().toLowerCase()
                                                        + " connection"));
        if (!connection.isEnabled()) {
            throw new IllegalArgumentException(
                    type.name().toLowerCase() + " connection is disabled");
        }
        return configOf(connection);
    }

    /** The settings for a generic {@code API} connection. */
    public ApiConnectionSettings resolve(Long connectionId) {
        return ApiConnectionSettings.from(resolveConfig(connectionId, IntegrationType.API));
    }

    /** Parse a {@code connectionId} step parameter; null when absent. */
    public static Long connectionId(Object reference) {
        if (reference == null || (reference instanceof String s && s.isBlank())) {
            return null;
        }
        if (reference instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.valueOf(reference.toString().trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(
                    "'connectionId' is not a valid connection reference: " + reference);
        }
    }

    /**
     * Whether the current caller may use this connection. A missing principal means a worker
     * thread, where access was established earlier; it must never be the only thing standing
     * between a caller and a connection, or the check becomes a confused deputy.
     */
    private boolean usableByCurrentUser(IntegrationConfig connection) {
        User user = currentUser();
        return user == null || ownership.canUse(ResourceType.INTEGRATION_CONFIG, connection, user);
    }

    // Mirrors ResourceAccessSecurity's principal resolution; null when unauthenticated.
    private User currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        Object principal = auth.getPrincipal();
        if (principal instanceof User user) {
            return user;
        }
        if (principal instanceof UserDetails userDetails) {
            return userService.findByUsername(userDetails.getUsername()).orElse(null);
        }
        if (principal instanceof String username && !"anonymousUser".equals(username)) {
            return userService.findByUsername(username).orElse(null);
        }
        return null;
    }

    private static Map<String, Object> configOf(IntegrationConfig connection) {
        String json = connection.getConfig();
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return OBJECT_MAPPER.readValue(
                    json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "connection '" + connection.getName() + "' has unreadable config", e);
        }
    }
}
