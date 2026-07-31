package stirling.software.proprietary.storage.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.storage.crypto.FileEncryptionKeyService;
import stirling.software.proprietary.storage.crypto.FileEncryptionMasterKey;
import stirling.software.proprietary.storage.crypto.InMemoryKeyRepo;
import stirling.software.proprietary.storage.crypto.StorageEncryptionAuditListener;
import stirling.software.proprietary.storage.crypto.StorageEncryptionState;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.storage.service.StorageEncryptionMigrationService;

/**
 * Drives the admin API over HTTP rather than as Java calls: path mappings, status codes and — the
 * part unit tests can't see — that the response records actually serialise. A UUID/Instant/enum
 * that Jackson cannot render would pass every direct-invocation test and fail the first request.
 *
 * <p>Note {@code standaloneSetup} deliberately does not install the security filter chain, so this
 * cannot prove {@code @PreAuthorize} enforcement; {@link #controller_isAdminOnly()} pins the
 * annotation instead (method security is enabled globally in {@code SecurityConfiguration}).
 */
class StorageEncryptionAdminControllerHttpTest {

    private static final String MASTER =
            Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes());

    private InMemoryKeyRepo keyRepo;
    private FileEncryptionKeyService keyService;
    private StorageEncryptionMigrationService migrationService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        keyRepo = new InMemoryKeyRepo();
        keyService =
                new FileEncryptionKeyService(
                        keyRepo.mock, new FileEncryptionMasterKey(MASTER, false));
        StoredFileRepository storedFileRepository = mock(StoredFileRepository.class);
        when(storedFileRepository.countByEncryptionKeyIdIsNotNull()).thenReturn(7L);
        when(storedFileRepository.countByEncryptionKeyIdIsNull()).thenReturn(3L);
        migrationService = mock(StorageEncryptionMigrationService.class);

        StorageEncryptionAdminController controller =
                new StorageEncryptionAdminController(
                        StorageEncryptionState.of(
                                true, keyService, StorageEncryptionAuditListener.NOOP),
                        keyRepo.mock,
                        storedFileRepository,
                        migrationService,
                        mock(AuditService.class));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private UUID seedKey() throws Exception {
        Team team = new Team();
        team.setId(1L);
        User owner = new User();
        owner.setTeam(team);
        return keyService.activeKekForOwner(owner).keyId();
    }

    @Test
    void status_serialisesCountsFingerprintAndKeyRows() throws Exception {
        UUID keyId = seedKey();

        mockMvc.perform(get("/api/v1/admin/storage-encryption/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.writeEnabled").value(true))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.masterKeyFingerprint").isString())
                .andExpect(jsonPath("$.masterKeyVersion").value(1))
                .andExpect(jsonPath("$.encryptedFiles").value(7))
                .andExpect(jsonPath("$.plaintextFiles").value(3))
                .andExpect(jsonPath("$.keys[0].keyId").value(keyId.toString()))
                .andExpect(jsonPath("$.keys[0].scopeType").value("TEAM"))
                .andExpect(jsonPath("$.keys[0].scopeId").value(1))
                .andExpect(jsonPath("$.keys[0].status").value("ACTIVE"));
    }

    @Test
    void disableThenEnable_serialiseKeyInfoAndReportStatusTransitions() throws Exception {
        UUID keyId = seedKey();

        mockMvc.perform(post("/api/v1/admin/storage-encryption/keys/" + keyId + "/disable"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keyId").value(keyId.toString()))
                .andExpect(jsonPath("$.status").value("DISABLED"))
                .andExpect(jsonPath("$.statusChangedAt").isNotEmpty());

        mockMvc.perform(post("/api/v1/admin/storage-encryption/keys/" + keyId + "/enable"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void enable_onActiveKey_returns409() throws Exception {
        UUID keyId = seedKey();

        mockMvc.perform(post("/api/v1/admin/storage-encryption/keys/" + keyId + "/enable"))
                .andExpect(status().isConflict());
    }

    @Test
    void disable_unknownKey_returns404() throws Exception {
        mockMvc.perform(
                        post(
                                "/api/v1/admin/storage-encryption/keys/"
                                        + UUID.randomUUID()
                                        + "/disable"))
                .andExpect(status().isNotFound());
    }

    @Test
    void migrateStatus_neverStarted_serialisesIdle() throws Exception {
        when(migrationService.status()).thenReturn(null);

        mockMvc.perform(get("/api/v1/admin/storage-encryption/migrate/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("IDLE"));
    }

    @Test
    void migrate_serialisesRunningSnapshotIncludingInstants() throws Exception {
        when(migrationService.start())
                .thenReturn(
                        new StorageEncryptionMigrationService.MigrationStatus(
                                StorageEncryptionMigrationService.State.RUNNING,
                                10,
                                2,
                                1,
                                0,
                                Instant.parse("2026-01-01T00:00:00Z"),
                                null));

        mockMvc.perform(post("/api/v1/admin/storage-encryption/migrate"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("RUNNING"))
                .andExpect(jsonPath("$.total").value(10))
                .andExpect(jsonPath("$.processed").value(2))
                .andExpect(jsonPath("$.skipped").value(1))
                .andExpect(jsonPath("$.startedAt").isNotEmpty())
                .andExpect(jsonPath("$.finishedAt").doesNotExist());
    }

    @Test
    void migrate_alreadyRunning_returns409() throws Exception {
        when(migrationService.start()).thenThrow(new IllegalStateException("already running"));

        mockMvc.perform(post("/api/v1/admin/storage-encryption/migrate"))
                .andExpect(status().isConflict());
    }

    @Test
    void rotate_serialisesRewrapCount() throws Exception {
        UUID keyId = seedKey();
        keyRepo.rows.get(keyId).setMasterKeyVersion(0);

        mockMvc.perform(post("/api/v1/admin/storage-encryption/master/rotate"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rewrapped").value(1))
                .andExpect(jsonPath("$.masterKeyVersion").value(1));
    }

    @Test
    void controller_isAdminOnly() {
        PreAuthorize preAuthorize =
                StorageEncryptionAdminController.class.getAnnotation(PreAuthorize.class);
        assertThat(preAuthorize).as("admin API must be role-gated").isNotNull();
        assertThat(preAuthorize.value()).isEqualTo("hasRole('ADMIN')");
    }

    @Test
    void noDeleteEndpointExists() {
        // The "key material can be disabled but never destroyed" guarantee is structural: assert no
        // handler method maps a DELETE.
        boolean anyDelete =
                java.util.Arrays.stream(StorageEncryptionAdminController.class.getMethods())
                        .anyMatch(
                                m ->
                                        m.isAnnotationPresent(
                                                org.springframework.web.bind.annotation
                                                        .DeleteMapping.class));
        assertThat(anyDelete).as("no endpoint may delete key material").isFalse();
    }
}
