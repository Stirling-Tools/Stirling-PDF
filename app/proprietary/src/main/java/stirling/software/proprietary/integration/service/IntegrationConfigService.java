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

import stirling.software.proprietary.access.model.DefaultAccessPolicy;
import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.access.model.ResourceType;
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

    // ---- commands ----

    @Transactional
    public IntegrationConfig create(IntegrationConfigRequest request, User currentUser) {
        OwnerScope scope = request.scope() == null ? OwnerScope.USER : request.scope();
        IntegrationConfig cfg = new IntegrationConfig();
        cfg.setIntegrationType(require(request.integrationType(), "integrationType"));
        cfg.setName(require(request.name(), "name"));
        cfg.setEnabled(request.enabled() == null || request.enabled());
        cfg.setLocked(request.locked() != null && request.locked());
        cfg.setDefaultAccess(
                request.defaultAccess() == null
                        ? DefaultAccessPolicy.EXPLICIT_ONLY
                        : request.defaultAccess());

        ownership.assignOwnership(
                cfg,
                scope,
                request.ownerTeamId(),
                currentUser,
                () -> lockedServerExists(cfg.getIntegrationType()));
        cfg.setConfig(writeJson(secretMasker.sanitize(request.config())));
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
            cfg.setConfig(
                    writeJson(secretMasker.merge(readJson(cfg.getConfig()), request.config())));
        }
        return repository.save(cfg);
    }

    @Transactional
    public void delete(Long id, User currentUser) {
        IntegrationConfig cfg = load(id);
        if (!ownership.canManage(TYPE, cfg, currentUser)) {
            throw forbidden("You cannot manage this integration");
        }
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
