package stirling.software.proprietary.security.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.api.apikey.CreateApiKeyRequest;
import stirling.software.proprietary.model.api.apikey.CreatedApiKeyDto;
import stirling.software.proprietary.model.api.apikey.PortalApiKeyDto;
import stirling.software.proprietary.model.api.apikey.PortalApiKeysResponse;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKey;
import stirling.software.proprietary.security.model.ApiKeyScope;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.ApiKeyDailyUsageRepository;
import stirling.software.proprietary.security.repository.ApiKeyRepository;
import stirling.software.proprietary.security.repository.TeamRepository;

/**
 * Portal-facing CRUD for named API keys: lists what the caller may see, creates personal or
 * team-scoped keys, and revokes them. Team scoping reuses {@link PolicyManagementAuthority} (a team
 * leader on SaaS, a global admin self-hosted) so it can't drift from the policy/source rules.
 *
 * <p>Personal keys are strictly owner-only. Every pre-existing single {@code users.apiKey} is
 * lazily represented as a PERSONAL key owned by that user, so historic keys can never surface to a
 * team.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApiKeyManagementService {

    private static final DateTimeFormatter CREATED_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter LAST_USED_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneOffset.UTC);
    private static final int MONTH_WINDOW_DAYS = 30;

    /** Bounds a key name so it can't bloat storage or the audit/processor feed. */
    private static final int MAX_NAME_LENGTH = 100;

    /** Caps active keys per user so key creation can't be used to multiply rate-limit budget. */
    private static final int MAX_ACTIVE_KEYS_PER_USER = 50;

    private final ApiKeyRepository apiKeyRepository;
    private final ApiKeyDailyUsageRepository usageRepository;
    private final UserRepository userRepository;
    private final TeamRepository teamRepository;
    private final UserService userService;
    private final PolicyManagementAuthority policyAuthority;

    /** All keys the caller may see, plus whether they may mint team keys. */
    @Transactional
    public PortalApiKeysResponse listVisibleKeys() {
        User caller = requireCaller();
        migrateLegacyKey(caller);

        boolean isManager = policyAuthority.canEditPolicies();
        Long teamId = policyAuthority.currentUserTeamId();
        String teamName = teamId == null ? null : teamNameFor(teamId);

        List<ApiKey> visible = new ArrayList<>();
        // Personal keys: only the caller's own.
        apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(caller.getId()).stream()
                .filter(k -> k.getScope() == ApiKeyScope.PERSONAL)
                .forEach(visible::add);
        // Team keys: members see TEAM_MEMBERS; only managers additionally see TEAM_LEAD.
        if (teamId != null) {
            apiKeyRepository.findByTeamIdOrderByCreatedAtDesc(teamId).stream()
                    .filter(k -> k.getScope().isTeamScoped())
                    .filter(k -> k.getScope() == ApiKeyScope.TEAM_MEMBERS || isManager)
                    .forEach(visible::add);
        }

        List<PortalApiKeyDto> keys =
                visible.stream().map(k -> toDto(caller, k, isManager, teamName)).toList();
        return PortalApiKeysResponse.builder()
                .keys(keys)
                .canCreateTeamKeys(isManager && teamId != null)
                .teamName(teamName)
                .build();
    }

    /** Create a key and return its one-time secret. */
    @Transactional
    public CreatedApiKeyDto createKey(CreateApiKeyRequest request) {
        User caller = requireCaller();
        String name = request == null ? null : request.name();
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Key name is required");
        }
        if (name.trim().length() > MAX_NAME_LENGTH) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Key name must be " + MAX_NAME_LENGTH + " characters or fewer");
        }
        long activeOwned =
                apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(caller.getId()).stream()
                        .filter(ApiKey::isActive)
                        .count();
        if (activeOwned >= MAX_ACTIVE_KEYS_PER_USER) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "You have reached the maximum of "
                            + MAX_ACTIVE_KEYS_PER_USER
                            + " active API keys; revoke one before creating another");
        }
        ApiKeyScope scope = parseScope(request.scope());

        Long teamId = null;
        String teamName = null;
        if (scope.isTeamScoped()) {
            if (!policyAuthority.canEditPolicies()) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN, "Only a team leader may create team API keys");
            }
            teamId = policyAuthority.currentUserTeamId();
            if (teamId == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "No team is available to scope this key to");
            }
            teamName = teamNameFor(teamId);
        }

        String rawKey = ApiKeyHasher.generateRawKey();
        ApiKey saved =
                apiKeyRepository.save(
                        ApiKey.builder()
                                .name(name.trim())
                                .keyHash(ApiKeyHasher.hash(rawKey))
                                .prefix(ApiKeyHasher.displayPrefix(rawKey))
                                .ownerUserId(caller.getId())
                                .teamId(teamId)
                                .scope(scope)
                                .enabled(true)
                                .createdAt(Instant.now())
                                .build());

        return CreatedApiKeyDto.builder()
                .key(toDto(caller, saved, policyAuthority.canEditPolicies(), teamName))
                .secret(rawKey)
                .build();
    }

    /** Soft-revoke a key the caller manages; also clears the legacy column if it is that key. */
    @Transactional
    public void revokeKey(Long id) {
        User caller = requireCaller();
        ApiKey key =
                apiKeyRepository
                        .findById(id)
                        .orElseThrow(
                                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No key"));
        if (!canManage(caller, key)) {
            // Not-found rather than forbidden so a caller can't probe other teams' key ids.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No key");
        }
        key.setEnabled(false);
        key.setRevokedAt(Instant.now());
        apiKeyRepository.save(key);
        clearLegacyColumnIfMatches(key);
    }

    /** Whether the caller may revoke a given key. */
    private boolean canManage(User caller, ApiKey key) {
        if (key.getScope() == ApiKeyScope.PERSONAL) {
            return key.getOwnerUserId().equals(caller.getId());
        }
        return policyAuthority.canEditPolicies()
                && key.getTeamId() != null
                && key.getTeamId().equals(policyAuthority.currentUserTeamId());
    }

    /** Represent a user's pre-existing single key as a PERSONAL row so it lists uniformly. */
    private void migrateLegacyKey(User user) {
        String legacy = user.getApiKey();
        if (legacy == null || legacy.isBlank()) {
            return;
        }
        String hash = ApiKeyHasher.hash(legacy);
        if (apiKeyRepository.existsByKeyHash(hash)) {
            return;
        }
        try {
            apiKeyRepository.save(
                    ApiKey.builder()
                            .name("Default key")
                            .keyHash(hash)
                            .prefix(ApiKeyHasher.displayPrefix(legacy))
                            .ownerUserId(user.getId())
                            .teamId(null)
                            .scope(ApiKeyScope.PERSONAL)
                            .enabled(true)
                            .createdAt(Instant.now())
                            .build());
        } catch (DataIntegrityViolationException alreadyMigrated) {
            // A concurrent first-load won the race and inserted the same hash; that's fine.
            log.debug("Legacy key already migrated concurrently for user {}", user.getId());
        }
    }

    /**
     * If a revoked key is the owner's legacy {@code users.apiKey}, null it so it stops resolving.
     */
    private void clearLegacyColumnIfMatches(ApiKey key) {
        userRepository
                .findById(key.getOwnerUserId())
                .ifPresent(
                        owner -> {
                            String legacy = owner.getApiKey();
                            if (legacy != null
                                    && ApiKeyHasher.hash(legacy).equals(key.getKeyHash())) {
                                owner.setApiKey(null);
                                userRepository.save(owner);
                            }
                        });
    }

    private PortalApiKeyDto toDto(User caller, ApiKey key, boolean isManager, String teamName) {
        long today = Instant.now().atZone(ZoneOffset.UTC).toLocalDate().toEpochDay();
        Long todayCount = usageRepository.countForDay(key.getId(), today);
        long usageMonth = usageRepository.sumSince(key.getId(), today - (MONTH_WINDOW_DAYS - 1));
        return PortalApiKeyDto.builder()
                .id(String.valueOf(key.getId()))
                .name(key.getName())
                .prefix(key.getPrefix())
                .scope(scopeLabel(key.getScope()))
                .teamName(key.getScope().isTeamScoped() ? teamName : null)
                .created(
                        key.getCreatedAt() == null ? "" : CREATED_FORMAT.format(key.getCreatedAt()))
                .lastUsed(
                        key.getLastUsedAt() == null
                                ? "Never"
                                : LAST_USED_FORMAT.format(key.getLastUsedAt()))
                .status(key.isActive() ? "active" : "revoked")
                .usageToday(todayCount == null ? 0 : todayCount)
                .usageMonth(usageMonth)
                .canManage(canManage(caller, key))
                .build();
    }

    private static String scopeLabel(ApiKeyScope scope) {
        return switch (scope) {
            case PERSONAL -> "personal";
            case TEAM_LEAD -> "team-lead";
            case TEAM_MEMBERS -> "team-members";
        };
    }

    private static ApiKeyScope parseScope(String raw) {
        if (raw == null || raw.isBlank()) {
            return ApiKeyScope.PERSONAL;
        }
        return switch (raw.trim().toLowerCase(Locale.ROOT)) {
            case "personal" -> ApiKeyScope.PERSONAL;
            case "team-lead", "team_lead", "teamlead" -> ApiKeyScope.TEAM_LEAD;
            case "team-members", "team_members", "teammembers", "team" -> ApiKeyScope.TEAM_MEMBERS;
            default ->
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "Unknown scope: " + raw);
        };
    }

    private String teamNameFor(Long teamId) {
        return teamRepository.findById(teamId).map(Team::getName).orElse(null);
    }

    private User requireCaller() {
        String username = userService.getCurrentUsername();
        if (username == null || username.isBlank() || "anonymousUser".equalsIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        return userService
                .findByUsernameIgnoreCase(username)
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
    }
}
