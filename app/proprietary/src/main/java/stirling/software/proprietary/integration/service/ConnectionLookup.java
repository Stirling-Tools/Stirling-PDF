package stirling.software.proprietary.integration.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

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

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ConnectionLookup {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final IntegrationConfigRepository connections;
    private final OwnershipService ownership;
    private final UserService userService;

    public Map<String, Object> load(
            Map<String, Object> options,
            IntegrationType type,
            String label,
            Set<String> perUseKeys,
            String pipelineOwner) {
        User acting = actingUser(pipelineOwner);

        long connectionId = connectionId(options, label);
        IntegrationConfig connection =
                connections
                        .findById(connectionId)
                        .filter(cfg -> cfg.getIntegrationType() == type)
                        .filter(cfg -> usableBy(acting, cfg))
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "unknown or inaccessible "
                                                        + label
                                                        + " connection"));
        if (!connection.isEnabled()) {
            throw new IllegalArgumentException(label + " connection is disabled");
        }
        Map<String, Object> merged = new LinkedHashMap<>(config(connection, label));
        for (String key : perUseKeys) {
            Object value = options.get(key);
            if (value != null && !value.toString().isBlank()) {
                merged.put(key, value);
            }
        }
        return merged;
    }

    public User currentUser() {
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

    private User actingUser(String pipelineOwner) {
        return pipelineOwner != null
                ? userService.findByUsername(pipelineOwner).orElse(null)
                : currentUser();
    }

    private boolean usableBy(User user, IntegrationConfig connection) {
        return user != null && ownership.canUse(ResourceType.INTEGRATION_CONFIG, connection, user);
    }

    private static long connectionId(Map<String, Object> options, String label) {
        Object reference = options.get("connectionId");
        if (reference == null || reference.toString().isBlank()) {
            throw new IllegalArgumentException(
                    "choose your connected account or a " + label + " connection");
        }
        if (reference instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(reference.toString().trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(
                    "'connectionId' is not a valid connection reference: " + reference);
        }
    }

    private static Map<String, Object> config(IntegrationConfig connection, String label) {
        String json = connection.getConfig();
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return OBJECT_MAPPER.readValue(
                    json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    label + " connection '" + connection.getName() + "' has unreadable config", e);
        }
    }
}
