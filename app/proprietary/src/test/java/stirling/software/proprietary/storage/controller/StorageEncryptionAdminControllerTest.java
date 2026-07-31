package stirling.software.proprietary.storage.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.storage.crypto.FileEncryptionKeyService;
import stirling.software.proprietary.storage.crypto.FileEncryptionMasterKey;
import stirling.software.proprietary.storage.crypto.InMemoryKeyRepo;
import stirling.software.proprietary.storage.crypto.StorageEncryptionAuditListener;
import stirling.software.proprietary.storage.crypto.StorageEncryptionState;
import stirling.software.proprietary.storage.model.api.StorageEncryptionStatusResponse;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.storage.service.StorageEncryptionMigrationService;

class StorageEncryptionAdminControllerTest {

    private static final String MASTER =
            Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes());

    private InMemoryKeyRepo keyRepo;
    private FileEncryptionKeyService keyService;
    private StoredFileRepository storedFileRepository;
    private StorageEncryptionMigrationService migrationService;
    private StorageEncryptionAdminController controller;

    @BeforeEach
    void setUp() {
        keyRepo = new InMemoryKeyRepo();
        keyService =
                new FileEncryptionKeyService(
                        keyRepo.mock, new FileEncryptionMasterKey(MASTER, false));
        storedFileRepository = mock(StoredFileRepository.class);
        when(storedFileRepository.countByEncryptionKeyIdIsNotNull()).thenReturn(4L);
        when(storedFileRepository.countByEncryptionKeyIdIsNull()).thenReturn(2L);
        migrationService = mock(StorageEncryptionMigrationService.class);
        controller =
                new StorageEncryptionAdminController(
                        StorageEncryptionState.of(
                                true, keyService, StorageEncryptionAuditListener.NOOP),
                        keyRepo.mock,
                        storedFileRepository,
                        migrationService,
                        mock(AuditService.class));
    }

    private UUID createKey() throws Exception {
        Team team = new Team();
        team.setId(1L);
        User owner = new User();
        owner.setTeam(team);
        return keyService.activeKekForOwner(owner).keyId();
    }

    @Test
    void status_reportsCountsFingerprintAndKeys() throws Exception {
        UUID keyId = createKey();
        StorageEncryptionStatusResponse status = controller.status();

        assertThat(status.writeEnabled()).isTrue();
        assertThat(status.active()).isTrue();
        assertThat(status.masterKeyFingerprint()).hasSize(16);
        assertThat(status.encryptedFiles()).isEqualTo(4);
        assertThat(status.plaintextFiles()).isEqualTo(2);
        assertThat(status.keys()).hasSize(1);
        assertThat(status.keys().get(0).keyId()).isEqualTo(keyId);
        assertThat(status.keys().get(0).status()).isEqualTo("ACTIVE");
    }

    @Test
    void disableThenEnable_roundTripsAndFailsClosedInBetween() throws Exception {
        UUID keyId = createKey();

        StorageEncryptionStatusResponse.KeyInfo disabled = controller.disableKey(keyId);
        assertThat(disabled.status()).isEqualTo("DISABLED");
        assertThatThrownBy(() -> keyService.kekForDecrypt(keyId)).hasMessageContaining("disabled");

        StorageEncryptionStatusResponse.KeyInfo enabled = controller.enableKey(keyId);
        assertThat(enabled.status()).isEqualTo("ACTIVE");
        assertThat(keyService.kekForDecrypt(keyId)).isNotNull();
    }

    @Test
    void enable_keyNotDisabled_conflicts() throws Exception {
        UUID keyId = createKey();
        assertThatThrownBy(() -> controller.enableKey(keyId))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode())
                                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void disable_unknownKey_notFound() {
        assertThatThrownBy(() -> controller.disableKey(UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode())
                                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void migrate_alreadyRunning_conflicts() {
        when(migrationService.start()).thenThrow(new IllegalStateException("already running"));
        assertThatThrownBy(() -> controller.startMigration())
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode())
                                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void migrationStatus_neverStarted_reportsIdle() {
        when(migrationService.status()).thenReturn(null);
        assertThat(controller.migrationStatus().state()).isEqualTo("IDLE");
    }

    @Test
    void rotate_whenInactive_conflicts() {
        StorageEncryptionAdminController inactive =
                new StorageEncryptionAdminController(
                        new StorageEncryptionState(
                                false,
                                () -> {
                                    throw new IllegalStateException("no key material configured");
                                },
                                keyRepo.mock,
                                StorageEncryptionAuditListener.NOOP),
                        keyRepo.mock,
                        storedFileRepository,
                        migrationService,
                        mock(AuditService.class));
        assertThatThrownBy(inactive::rotateMasterKey)
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode())
                                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void rotate_rewrapsPendingRows() throws Exception {
        UUID keyId = createKey();
        keyRepo.rows.get(keyId).setMasterKeyVersion(0); // pretend wrapped by an older master

        var result = controller.rotateMasterKey();
        assertThat(result.get("rewrapped")).isEqualTo(1);
        assertThat(keyRepo.rows.get(keyId).getMasterKeyVersion()).isEqualTo(1);
    }
}
