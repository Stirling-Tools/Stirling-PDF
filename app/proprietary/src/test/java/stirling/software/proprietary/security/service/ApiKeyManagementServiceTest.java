package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.api.apikey.CreateApiKeyRequest;
import stirling.software.proprietary.model.api.apikey.CreatedApiKeyDto;
import stirling.software.proprietary.model.api.apikey.PortalApiKeysResponse;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKey;
import stirling.software.proprietary.security.model.ApiKeyScope;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.ApiKeyDailyUsageRepository;
import stirling.software.proprietary.security.repository.ApiKeyRepository;
import stirling.software.proprietary.security.repository.TeamRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("ApiKeyManagementService")
class ApiKeyManagementServiceTest {

    @Mock private ApiKeyRepository apiKeyRepository;
    @Mock private ApiKeyDailyUsageRepository usageRepository;
    @Mock private UserRepository userRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private UserService userService;
    @Mock private PolicyManagementAuthority policyAuthority;
    @InjectMocks private ApiKeyManagementService service;

    private User caller;

    @BeforeEach
    void setUp() {
        caller = new User();
        caller.setId(1L);
        caller.setUsername("alice");
        lenient().when(userService.getCurrentUsername()).thenReturn("alice");
        lenient()
                .when(userService.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(caller));
        lenient().when(apiKeyRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(usageRepository.countForDay(any(), anyLong())).thenReturn(0L);
        lenient().when(usageRepository.sumSince(any(), anyLong())).thenReturn(0L);
    }

    private ApiKey personalKey(long id, long ownerId) {
        return ApiKey.builder()
                .id(id)
                .name("Key " + id)
                .keyHash("hash" + id)
                .prefix("sk_demo0000")
                .ownerUserId(ownerId)
                .scope(ApiKeyScope.PERSONAL)
                .enabled(true)
                .createdAt(Instant.now())
                .build();
    }

    private ApiKey teamKey(long id, long teamId, ApiKeyScope scope) {
        return ApiKey.builder()
                .id(id)
                .name("Team key " + id)
                .keyHash("hash" + id)
                .prefix("sk_demo0000")
                .ownerUserId(99L)
                .teamId(teamId)
                .scope(scope)
                .enabled(true)
                .createdAt(Instant.now())
                .build();
    }

    // ---- migration safety ---------------------------------------------------

    @Test
    @DisplayName("an existing legacy key migrates to a PERSONAL, owner-only row - never a team")
    void legacyKeyMigratesAsPersonal() {
        caller.setApiKey("legacy-raw-key");
        when(apiKeyRepository.existsByKeyHash(ApiKeyHasher.hash("legacy-raw-key")))
                .thenReturn(false);
        when(policyAuthority.currentUserTeamId()).thenReturn(null);
        when(apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());

        service.listVisibleKeys();

        ArgumentCaptor<ApiKey> saved = ArgumentCaptor.forClass(ApiKey.class);
        verify(apiKeyRepository).save(saved.capture());
        ApiKey migrated = saved.getValue();
        assertThat(migrated.getScope()).isEqualTo(ApiKeyScope.PERSONAL);
        assertThat(migrated.getOwnerUserId()).isEqualTo(1L);
        assertThat(migrated.getTeamId()).isNull();
    }

    @Test
    @DisplayName("migration is idempotent - an already-migrated legacy key is not re-saved")
    void legacyKeyMigrationIdempotent() {
        caller.setApiKey("legacy-raw-key");
        when(apiKeyRepository.existsByKeyHash(ApiKeyHasher.hash("legacy-raw-key")))
                .thenReturn(true);
        when(policyAuthority.currentUserTeamId()).thenReturn(null);
        when(apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());

        service.listVisibleKeys();

        verify(apiKeyRepository, never()).save(any());
    }

    // ---- personal isolation -------------------------------------------------

    @Test
    @DisplayName("listing scopes personal keys to the caller by owner id")
    void personalKeysScopedToOwner() {
        when(policyAuthority.currentUserTeamId()).thenReturn(null);
        when(apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(personalKey(10, 1L)));

        PortalApiKeysResponse res = service.listVisibleKeys();

        assertThat(res.keys())
                .singleElement()
                .satisfies(k -> assertThat(k.scope()).isEqualTo("personal"));
        // Isolation: the query is keyed by the caller's id, never a broad scan.
        verify(apiKeyRepository).findByOwnerUserIdOrderByCreatedAtDesc(1L);
    }

    @Test
    @DisplayName("a member sees TEAM_MEMBERS keys but not TEAM_LEAD keys")
    void memberSeesTeamMembersNotTeamLead() {
        when(policyAuthority.canEditPolicies()).thenReturn(false);
        when(policyAuthority.currentUserTeamId()).thenReturn(5L);
        when(apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());
        when(apiKeyRepository.findByTeamIdOrderByCreatedAtDesc(5L))
                .thenReturn(
                        List.of(
                                teamKey(20, 5L, ApiKeyScope.TEAM_LEAD),
                                teamKey(21, 5L, ApiKeyScope.TEAM_MEMBERS)));
        Team team = new Team();
        team.setName("Acme");
        lenient().when(teamRepository.findById(5L)).thenReturn(Optional.of(team));

        PortalApiKeysResponse res = service.listVisibleKeys();

        assertThat(res.keys()).singleElement().satisfies(k -> assertThat(k.id()).isEqualTo("21"));
        assertThat(res.canCreateTeamKeys()).isFalse();
    }

    // ---- creation -----------------------------------------------------------

    @Test
    @DisplayName("any user can create a personal key and gets a one-time secret")
    void createPersonalKey() {
        CreatedApiKeyDto created = service.createKey(new CreateApiKeyRequest("My key", "personal"));

        assertThat(created.secret()).startsWith("sk_");
        ArgumentCaptor<ApiKey> saved = ArgumentCaptor.forClass(ApiKey.class);
        verify(apiKeyRepository).save(saved.capture());
        assertThat(saved.getValue().getScope()).isEqualTo(ApiKeyScope.PERSONAL);
        assertThat(saved.getValue().getTeamId()).isNull();
        assertThat(saved.getValue().getOwnerUserId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("rejects an over-long key name")
    void rejectsLongName() {
        String longName = "a".repeat(101);
        assertThatThrownBy(() -> service.createKey(new CreateApiKeyRequest(longName, "personal")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("characters or fewer");
        verify(apiKeyRepository, never()).save(any());
    }

    @Test
    @DisplayName("rejects creating a key past the per-user active-key cap")
    void rejectsPastActiveKeyCap() {
        when(apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(1L))
                .thenReturn(java.util.Collections.nCopies(50, personalKey(100, 1L)));

        assertThatThrownBy(
                        () ->
                                service.createKey(
                                        new CreateApiKeyRequest("One too many", "personal")))
                .isInstanceOf(ResponseStatusException.class);
        verify(apiKeyRepository, never()).save(any());
    }

    @Test
    @DisplayName("creating a team key without leader rights is forbidden")
    void createTeamKeyRequiresLeader() {
        when(policyAuthority.canEditPolicies()).thenReturn(false);

        assertThatThrownBy(
                        () ->
                                service.createKey(
                                        new CreateApiKeyRequest("Team key", "team-members")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("team leader");
        verify(apiKeyRepository, never()).save(any());
    }

    @Test
    @DisplayName("a leader creates a team key scoped to their own team")
    void createTeamKeyAsLeader() {
        when(policyAuthority.canEditPolicies()).thenReturn(true);
        when(policyAuthority.currentUserTeamId()).thenReturn(5L);
        Team team = new Team();
        team.setName("Acme");
        when(teamRepository.findById(5L)).thenReturn(Optional.of(team));

        service.createKey(new CreateApiKeyRequest("Team key", "team-members"));

        ArgumentCaptor<ApiKey> saved = ArgumentCaptor.forClass(ApiKey.class);
        verify(apiKeyRepository).save(saved.capture());
        assertThat(saved.getValue().getScope()).isEqualTo(ApiKeyScope.TEAM_MEMBERS);
        assertThat(saved.getValue().getTeamId()).isEqualTo(5L);
    }

    @Test
    @DisplayName("an admin who is not a team leader can still create a team key")
    void adminCanCreateTeamKey() {
        when(policyAuthority.canEditPolicies()).thenReturn(false);
        when(userService.isCurrentUserAdmin()).thenReturn(true);
        when(policyAuthority.currentUserTeamId()).thenReturn(5L);
        Team team = new Team();
        team.setName("Acme");
        when(teamRepository.findById(5L)).thenReturn(Optional.of(team));

        service.createKey(new CreateApiKeyRequest("Admin team key", "team-members"));

        ArgumentCaptor<ApiKey> saved = ArgumentCaptor.forClass(ApiKey.class);
        verify(apiKeyRepository).save(saved.capture());
        assertThat(saved.getValue().getScope()).isEqualTo(ApiKeyScope.TEAM_MEMBERS);
        assertThat(saved.getValue().getTeamId()).isEqualTo(5L);
    }

    // ---- revocation ---------------------------------------------------------

    @Test
    @DisplayName("owner revokes their personal key and the legacy column is cleared")
    void revokePersonalClearsLegacy() {
        caller.setApiKey("legacy-raw-key");
        ApiKey legacyRow = personalKey(30, 1L);
        legacyRow.setKeyHash(ApiKeyHasher.hash("legacy-raw-key"));
        when(apiKeyRepository.findById(30L)).thenReturn(Optional.of(legacyRow));
        when(userRepository.findById(1L)).thenReturn(Optional.of(caller));

        service.revokeKey(30L);

        assertThat(legacyRow.isEnabled()).isFalse();
        assertThat(legacyRow.getRevokedAt()).isNotNull();
        assertThat(caller.getApiKey()).isNull();
        verify(userRepository).save(caller);
    }

    @Test
    @DisplayName("a non-owner cannot revoke someone else's personal key")
    void revokeForeignPersonalKeyForbidden() {
        when(apiKeyRepository.findById(31L)).thenReturn(Optional.of(personalKey(31, 999L)));

        assertThatThrownBy(() -> service.revokeKey(31L))
                .isInstanceOf(ResponseStatusException.class);
        verify(apiKeyRepository, never()).save(any());
    }

    @Test
    @DisplayName("a non-leader cannot revoke a team key")
    void revokeTeamKeyRequiresLeader() {
        when(apiKeyRepository.findById(32L))
                .thenReturn(Optional.of(teamKey(32, 5L, ApiKeyScope.TEAM_MEMBERS)));
        when(policyAuthority.canEditPolicies()).thenReturn(false);

        assertThatThrownBy(() -> service.revokeKey(32L))
                .isInstanceOf(ResponseStatusException.class);
    }
}
