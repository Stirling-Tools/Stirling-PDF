package stirling.software.proprietary.policy.s3;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

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
 * Turns a source's or output's options into a full {@link S3Config} by dereferencing its {@code
 * connectionId} to a stored S3 {@link IntegrationConfig} (the connection owns bucket, region,
 * endpoint, and credentials; the options own per-use settings such as prefix and mode). Options
 * with no {@code connectionId} fall back to legacy embedded credentials, so rows written before
 * connections shipped keep working until {@link EmbeddedS3CredentialMigration} rewrites them.
 *
 * <p>When an authenticated caller is present (save-time validation), they must be allowed to use
 * the connection. Background sweeps and deliveries run with no caller and skip that check: the
 * referencing source or policy was access-checked when it was saved.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class S3ConnectionResolver {

    static final String CONNECTION_ID_OPTION = "connectionId";
    private static final String PREFIX_OPTION = "prefix";
    private static final String MODE_OPTION = "mode";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final IntegrationConfigRepository connections;
    private final OwnershipService ownership;
    private final UserService userService;

    public S3Config resolve(Map<String, Object> options) {
        Long connectionId = connectionId(options);
        if (connectionId == null) {
            // Legacy embedded credentials, pending migration.
            return S3Config.from(options);
        }
        IntegrationConfig connection =
                connections
                        .findById(connectionId)
                        .filter(cfg -> cfg.getIntegrationType() == IntegrationType.S3)
                        .filter(this::usableByCurrentUser)
                        // Existence and access collapse into one error: a caller must not be able
                        // to tell "no such connection" from "someone else's connection" and
                        // enumerate ids. The id/name are never echoed.
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "unknown or inaccessible s3 connection"));
        if (!connection.isEnabled()) {
            throw new IllegalArgumentException("s3 connection is disabled");
        }
        Map<String, Object> merged = new LinkedHashMap<>(connectionConfig(connection));
        copyPerUseOption(options, merged, PREFIX_OPTION);
        copyPerUseOption(options, merged, MODE_OPTION);
        return S3Config.from(merged);
    }

    /** The {@code connectionId} option as a long, or null when the options are legacy-embedded. */
    static Long connectionId(Map<String, Object> options) {
        Object reference = options.get(CONNECTION_ID_OPTION);
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
                    "s3 'connectionId' is not a valid connection reference: " + reference);
        }
    }

    /**
     * Whether the current caller may use this connection. With no principal - a background sweep or
     * delivery on a worker thread that carries no {@code SecurityContext} - access is treated as
     * already established: stored policies are validated with the caller present at save time, and
     * ad-hoc runs are validated on the request thread before dispatch (see {@code
     * PolicyValidator#validateOutput}). A missing principal must therefore never be the ONLY thing
     * standing between a caller and a connection, or the check becomes a confused deputy.
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

    private static Map<String, Object> connectionConfig(IntegrationConfig connection) {
        String json = connection.getConfig();
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return OBJECT_MAPPER.readValue(
                    json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "s3 connection '" + connection.getName() + "' has unreadable config", e);
        }
    }

    private static void copyPerUseOption(
            Map<String, Object> options, Map<String, Object> merged, String key) {
        Object value = options.get(key);
        if (value != null && !value.toString().isBlank()) {
            merged.put(key, value);
        }
    }
}
