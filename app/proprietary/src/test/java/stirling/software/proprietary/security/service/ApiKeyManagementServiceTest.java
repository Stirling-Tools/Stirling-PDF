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

import stirling.software.proprietary.model.api.apikey.CreateApiKeyRequest;
import stirling.software.proprietary.model.api.apikey.CreatedApiKeyDto;
import stirling.software.proprietary.model.api.apikey.PortalApiKeysResponse;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKey;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.ApiKeyDailyUsageRepository;
import stirling.software.proprietary.security.repository.ApiKeyRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("ApiKeyManagementService")
class ApiKeyManagementServiceTest {

    @Mock private ApiKeyRepository apiKeyRepository;
    @Mock private ApiKeyDailyUsageRepository usageRepository;
    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private ApiKeyLegacyMigrator legacyMigrator;
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
        lenient().when(usageRepository.countForDayByIds(any(), anyLong())).thenReturn(List.of());
        lenient().when(usageRepository.sumSinceByIds(any(), anyLong())).thenReturn(List.of());
    }

    private ApiKey personalKey(long id, long ownerId) {
        return ApiKey.builder()
                .id(id)
                .name("Key " + id)
                .keyHash("hash" + id)
                .prefix("sk_demo0000")
                .ownerUserId(ownerId)
                .enabled(true)
                .createdAt(Instant.now())
                .build();
    }

    // ---- migration safety ---------------------------------------------------

    @Test
    @DisplayName("an existing legacy key migrates to an owner-only row")
    void legacyKeyMigratesAsPersonal() {
        caller.setApiKey("legacy-raw-key");
        when(apiKeyRepository.existsByKeyHash(ApiKeyHasher.hash("legacy-raw-key")))
                .thenReturn(false);
        when(apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());

        service.listVisibleKeys();

        // Migration insert is isolated in its own transaction (ApiKeyLegacyMigrator).
        ArgumentCaptor<ApiKey> saved = ArgumentCaptor.forClass(ApiKey.class);
        verify(legacyMigrator).insertMigratedKey(saved.capture());
        ApiKey migrated = saved.getValue();
        assertThat(migrated.getOwnerUserId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("migration is idempotent - an already-migrated legacy key is not re-saved")
    void legacyKeyMigrationIdempotent() {
        caller.setApiKey("legacy-raw-key");
        when(apiKeyRepository.existsByKeyHash(ApiKeyHasher.hash("legacy-raw-key")))
                .thenReturn(true);
        when(apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());

        service.listVisibleKeys();

        verify(legacyMigrator, never()).insertMigratedKey(any());
    }

    // ---- personal isolation -------------------------------------------------

    @Test
    @DisplayName("listing scopes keys to the caller by owner id")
    void personalKeysScopedToOwner() {
        when(apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(personalKey(10, 1L)));

        PortalApiKeysResponse res = service.listVisibleKeys();

        assertThat(res.keys()).singleElement().satisfies(k -> assertThat(k.id()).isEqualTo("10"));
        // Isolation: the query is keyed by the caller's id, never a broad scan.
        verify(apiKeyRepository).findByOwnerUserIdOrderByCreatedAtDesc(1L);
    }

    // ---- creation -----------------------------------------------------------

    @Test
    @DisplayName("a user creates a personal key and gets a one-time secret")
    void createPersonalKey() {
        CreatedApiKeyDto created = service.createKey(new CreateApiKeyRequest("My key"));

        assertThat(created.secret()).startsWith("sk_");
        ArgumentCaptor<ApiKey> saved = ArgumentCaptor.forClass(ApiKey.class);
        verify(apiKeyRepository).save(saved.capture());
        assertThat(saved.getValue().getOwnerUserId()).isEqualTo(1L);
        assertThat(saved.getValue().getName()).isEqualTo("My key");
    }

    @Test
    @DisplayName("rejects an over-long key name")
    void rejectsLongName() {
        String longName = "a".repeat(101);
        assertThatThrownBy(() -> service.createKey(new CreateApiKeyRequest(longName)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("characters or fewer");
        verify(apiKeyRepository, never()).save(any());
    }

    @Test
    @DisplayName("rejects a blank key name")
    void rejectsBlankName() {
        assertThatThrownBy(() -> service.createKey(new CreateApiKeyRequest("  ")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("required");
        verify(apiKeyRepository, never()).save(any());
    }

    @Test
    @DisplayName("rejects creating a key past the per-user active-key cap")
    void rejectsPastActiveKeyCap() {
        when(apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(1L))
                .thenReturn(java.util.Collections.nCopies(50, personalKey(100, 1L)));

        assertThatThrownBy(() -> service.createKey(new CreateApiKeyRequest("One too many")))
                .isInstanceOf(ResponseStatusException.class);
        verify(apiKeyRepository, never()).save(any());
    }

    // ---- revocation ---------------------------------------------------------

    @Test
    @DisplayName("owner revokes their key and the legacy column is cleared")
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
    @DisplayName(
            "a non-owner cannot revoke someone else's key (404, not 403, so ids can't be probed)")
    void revokeForeignKeyForbidden() {
        when(apiKeyRepository.findById(31L)).thenReturn(Optional.of(personalKey(31, 999L)));

        assertThatThrownBy(() -> service.revokeKey(31L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode().value())
                                        .isEqualTo(404));
        verify(apiKeyRepository, never()).save(any());
    }
}
