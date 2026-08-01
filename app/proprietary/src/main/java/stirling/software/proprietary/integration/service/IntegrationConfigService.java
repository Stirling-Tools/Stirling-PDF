package stirling.software.proprietary.integration.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.access.model.DefaultAccessPolicy;
import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.access.service.SecretMasker;
import stirling.software.proprietary.integration.dto.IntegrationConfigRequest;
import stirling.software.proprietary.integration.dto.IntegrationConfigResponse;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.security.model.User;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** CRUD for {@link IntegrationConfig}; delegates ownership and masking to shared services. */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class IntegrationConfigService {

    private static final ResourceType TYPE = ResourceType.INTEGRATION_CONFIG;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final IntegrationConfigRepository repository;
    private final OwnershipService ownership;
    private final SecretMasker secretMasker;
    private final ResourceGrantRepository grantRepository;
    private final ApplicationProperties applicationProperties;
    // Bean-discovered extension points: features that understand a type contribute its config
    // schema and report what still references a config, without this module depending on them.
    private final List<IntegrationConfigValidator> validators;
    private final List<IntegrationConfigUsageCheck> usageChecks;

    // ---- commands ----

    @Transactional
    public IntegrationConfig create(IntegrationConfigRequest request, User currentUser) {
        OwnerScope scope = request.scope() == null ? OwnerScope.USER : request.scope();
        IntegrationConfig cfg = new IntegrationConfig();
        cfg.setIntegrationType(require(request.integrationType(), "integrationType"));
        // S3 is infrastructure, not self-serve: no personal S3 for regular users. TEAM/SERVER
        // scopes are already restricted to admins/team owners by assignOwnership.
        if (cfg.getIntegrationType() == IntegrationType.S3
                && scope == OwnerScope.USER
                && !ownership.isAdmin(currentUser)) {
            throw forbidden("S3 connections can only be created by administrators or team owners");
        }
        requireCustomApiAllowed(cfg.getIntegrationType(), currentUser);
        cfg.setName(require(request.name(), "name"));
        cfg.setEnabled(request.enabled() == null || request.enabled());
        cfg.setLocked(request.locked() != null && request.locked());
        cfg.setDefaultAccess(
                request.defaultAccess() == null
                        ? DefaultAccessPolicy.EXPLICIT_ONLY
                        : request.defaultAccess());

        // TEAM scope may omit the team id: default to the caller's own team so clients (the
        // portal) need not know it. assignOwnership still enforces admin-or-leader of that team.
        Long ownerTeamId = request.ownerTeamId();
        if (ownerTeamId == null && scope == OwnerScope.TEAM && currentUser.getTeam() != null) {
            ownerTeamId = currentUser.getTeam().getId();
        }
        ownership.assignOwnership(
                cfg,
                scope,
                ownerTeamId,
                currentUser,
                () -> lockedServerExists(cfg.getIntegrationType()));
        Map<String, Object> config = secretMasker.sanitize(request.config());
        validateConfig(cfg.getIntegrationType(), config);
        cfg.setConfig(writeJson(config));
        return repository.save(cfg);
    }

    @Transactional
    public IntegrationConfig update(Long id, IntegrationConfigRequest request, User currentUser) {
        IntegrationConfig cfg = load(id);
        if (!ownership.canManage(TYPE, cfg, currentUser)) {
            throw forbidden("You cannot manage this integration");
        }
        if (cfg.isLocked() && !ownership.isAdmin(currentUser)) {
            throw forbidden("This integration is locked by an administrator");
        }
        if (request.name() != null) {
            cfg.setName(request.name());
        }
        if (request.enabled() != null) {
            cfg.setEnabled(request.enabled());
        }
        if (request.locked() != null && request.locked() != cfg.isLocked()) {
            if (!ownership.isAdmin(currentUser)) {
                throw forbidden("Only administrators can change the locked flag");
            }
            cfg.setLocked(request.locked());
        }
        if (request.defaultAccess() != null) {
            cfg.setDefaultAccess(request.defaultAccess());
        }
        if (request.config() != null) {
            // Editing the config of a custom integration is the same authoring power as creating
            // one - it is where the base URL and body live - so it is gated identically.
            requireCustomApiAllowed(cfg.getIntegrationType(), currentUser);
            Map<String, Object> merged =
                    secretMasker.merge(readJson(cfg.getConfig()), request.config());
            validateConfig(cfg.getIntegrationType(), merged);
            cfg.setConfig(writeJson(merged));
        }
        return repository.save(cfg);
    }

    /**
     * A custom API integration names its own host, path and body, so it can point the server
     * anywhere. That is authoring power rather than self-serve configuration: admins only, and the
     * operator can withdraw it entirely. The vendor presets are not gated here - they carry a fixed
     * shape, so the worst a user can do is misconfigure their own connection.
     */
    private void requireCustomApiAllowed(IntegrationType type, User currentUser) {
        if (type != IntegrationType.API) {
            return;
        }
        if (!applicationProperties.getPolicies().isAllowCustomApiIntegrations()) {
            throw forbidden(
                    "Custom API integrations are disabled on this server"
                            + " (policies.allowCustomApiIntegrations)");
        }
        if (!ownership.isAdmin(currentUser)) {
            throw forbidden("Custom API integrations can only be created by administrators");
        }
    }

    /** Whether this caller may author custom API integrations, for the UI to offer or hide it. */
    public boolean canAuthorCustomApi(User currentUser) {
        return applicationProperties.getPolicies().isAllowCustomApiIntegrations()
                && ownership.isAdmin(currentUser);
    }

    @Transactional
    public void delete(Long id, User currentUser) {
        IntegrationConfig cfg = load(id);
        if (!ownership.canManage(TYPE, cfg, currentUser)) {
            throw forbidden("You cannot manage this integration");
        }
        // Refuse to pull a connection out from under whatever still references it.
        List<String> usages =
                usageChecks.stream()
                        .flatMap(check -> check.usagesOf(cfg.getId()).stream())
                        .toList();
        if (!usages.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Integration is in use by: " + String.join(", ", usages));
        }
        // Drop grants sharing this config so they do not dangle as dead rows.
        grantRepository.deleteByResourceTypeAndResourceId(TYPE, String.valueOf(cfg.getId()));
        repository.delete(cfg);
    }

    // ---- queries ----

    public IntegrationConfig getForUse(Long id, User currentUser) {
        IntegrationConfig cfg = load(id);
        if (!ownership.canUse(TYPE, cfg, currentUser)) {
            throw forbidden("You cannot access this integration");
        }
        return cfg;
    }

    /**
     * All configs the user owns, plus server/team configs and grant-shared configs they may use.
     */
    public List<IntegrationConfig> listVisible(User currentUser) {
        Map<Long, IntegrationConfig> byId = new LinkedHashMap<>();
        for (IntegrationConfig c : repository.findByOwnerUser(currentUser)) {
            byId.put(c.getId(), c);
        }
        for (IntegrationConfig c : repository.findByScope(OwnerScope.SERVER)) {
            if (ownership.canUse(TYPE, c, currentUser)) {
                byId.put(c.getId(), c);
            }
        }
        if (currentUser.getTeam() != null) {
            for (IntegrationConfig c : repository.findByOwnerTeam(currentUser.getTeam())) {
                if (ownership.canUse(TYPE, c, currentUser)) {
                    byId.put(c.getId(), c);
                }
            }
        }
        for (String rid : ownership.grantedResourceIds(TYPE, currentUser)) {
            if (rid == null || rid.isBlank()) {
                continue;
            }
            Long cid;
            try {
                cid = Long.valueOf(rid);
            } catch (NumberFormatException e) {
                continue;
            }
            if (byId.containsKey(cid)) {
                continue;
            }
            repository
                    .findById(cid)
                    .filter(c -> ownership.canUse(TYPE, c, currentUser))
                    .ifPresent(c -> byId.put(c.getId(), c));
        }
        return new ArrayList<>(byId.values());
    }

    public IntegrationConfigResponse toResponse(IntegrationConfig cfg, User user) {
        return new IntegrationConfigResponse(
                cfg.getId(),
                cfg.getIntegrationType(),
                cfg.getName(),
                cfg.getScope(),
                cfg.getOwnerUserId(),
                cfg.getOwnerTeamId(),
                cfg.isEnabled(),
                cfg.isLocked(),
                cfg.getDefaultAccess(),
                secretMasker.mask(readJson(cfg.getConfig())),
                ownership.canManage(TYPE, cfg, user),
                cfg.getCreatedAt(),
                cfg.getUpdatedAt());
    }

    // ---- integration-specific glue ----

    /** Runs every registered validator for the type; unknown types save free-form. */
    private void validateConfig(IntegrationType type, Map<String, Object> config) {
        for (IntegrationConfigValidator validator : validators) {
            if (validator.type() == type) {
                try {
                    validator.validate(config == null ? Map.of() : config);
                } catch (IllegalArgumentException e) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
                }
            }
        }
    }

    /** A non-admin can't create a personal config of a type an admin has locked at server scope. */
    private boolean lockedServerExists(IntegrationType type) {
        return repository.findByScope(OwnerScope.SERVER).stream()
                .anyMatch(c -> c.getIntegrationType() == type && c.isLocked());
    }

    private IntegrationConfig load(Long id) {
        return repository
                .findById(id)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "Integration not found"));
    }

    private String writeJson(Map<String, Object> config) {
        try {
            return OBJECT_MAPPER.writeValueAsString(config == null ? Map.of() : config);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid config payload");
        }
    }

    private Map<String, Object> readJson(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return OBJECT_MAPPER.readValue(
                    json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            log.error("Failed to parse integration config JSON", e);
            return new LinkedHashMap<>();
        }
    }

    private <T> T require(T value, String field) {
        if (value == null || (value instanceof String s && s.isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required");
        }
        return value;
    }

    private ResponseStatusException forbidden(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }
}
