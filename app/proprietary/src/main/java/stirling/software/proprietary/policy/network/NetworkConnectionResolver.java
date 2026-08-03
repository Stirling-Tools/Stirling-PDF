package stirling.software.proprietary.policy.network;

import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.common.security.UserDetails;
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
 * Turns a network source's options into a full {@link NetworkConfig} by dereferencing its {@code
 * connectionId} to a stored NETWORK {@link IntegrationConfig} (the connection owns protocol, host,
 * credentials and, for SMB, the share; the options own the per-use directory and mode). Options
 * with no {@code connectionId} are parsed directly, so a programmatic caller can embed config.
 *
 * <p>Mirrors {@code S3ConnectionResolver}: an authenticated caller (save-time validation) must be
 * allowed to use the connection; a background sweep with no caller skips that check, since the
 * referencing source was access-checked when it was saved.
 */
@ApplicationScoped
@RequiredArgsConstructor
// jakarta.transaction.Transactional has no readOnly hint; the reads are unchanged without it.
@Transactional
public class NetworkConnectionResolver {

    static final String CONNECTION_ID_OPTION = "connectionId";
    private static final String DIRECTORY_OPTION = "directory";
    private static final String MODE_OPTION = "mode";
    private static final String RECURSIVE_OPTION = "recursive";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final IntegrationConfigRepository connections;
    private final OwnershipService ownership;
    private final UserService userService;

    public NetworkConfig resolve(Map<String, Object> options) {
        Long connectionId = connectionId(options);
        if (connectionId == null) {
            return NetworkConfig.from(options);
        }
        IntegrationConfig connection =
                connections
                        .findById(connectionId)
                        .filter(cfg -> cfg.getIntegrationType() == IntegrationType.NETWORK)
                        .filter(this::usableByCurrentUser)
                        // Existence and access collapse into one error so a caller cannot tell
                        // "no such connection" from "someone else's" and enumerate ids.
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "unknown or inaccessible network connection"));
        if (!connection.isEnabled()) {
            throw new IllegalArgumentException("network connection is disabled");
        }
        Map<String, Object> merged = new LinkedHashMap<>(connectionConfig(connection));
        copyPerUseOption(options, merged, DIRECTORY_OPTION);
        copyPerUseOption(options, merged, MODE_OPTION);
        copyPerUseOption(options, merged, RECURSIVE_OPTION);
        return NetworkConfig.from(merged);
    }

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
                    "network 'connectionId' is not a valid connection reference: " + reference);
        }
    }

    private boolean usableByCurrentUser(IntegrationConfig connection) {
        User user = currentUser();
        return user == null || ownership.canUse(ResourceType.INTEGRATION_CONFIG, connection, user);
    }

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
                    "network connection '" + connection.getName() + "' has unreadable config", e);
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
