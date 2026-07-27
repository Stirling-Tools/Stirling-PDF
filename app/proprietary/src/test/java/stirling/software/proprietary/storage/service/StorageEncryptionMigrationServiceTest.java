package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.domain.Pageable;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.storage.crypto.EncryptingStorageProvider;
import stirling.software.proprietary.storage.crypto.FileEncryptionKeyService;
import stirling.software.proprietary.storage.crypto.FileEncryptionMasterKey;
import stirling.software.proprietary.storage.crypto.InMemoryKeyRepo;
import stirling.software.proprietary.storage.crypto.StorageEncryptionAuditListener;
import stirling.software.proprietary.storage.crypto.StorageEncryptionState;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

class StorageEncryptionMigrationServiceTest {

    private static final byte[] CONTENT =
            "legacy plaintext content that must end up encrypted".getBytes(StandardCharsets.UTF_8);
    private static final String MASTER =
            Base64.getEncoder()
                    .encodeToString(
                            "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8));

    @TempDir Path tempDir;

    private final Map<Long, StoredFile> rows = new ConcurrentHashMap<>();
    private LocalStorageProvider inner;
    private StorageProvider provider;
    private StoredFileRepository fileRepo;
    private StorageEncryptionMigrationService service;
    private User owner;

    @BeforeEach
    void setUp() {
        inner = new LocalStorageProvider(tempDir);
        FileEncryptionKeyService keyService =
                new FileEncryptionKeyService(
                        new InMemoryKeyRepo().mock, new FileEncryptionMasterKey(MASTER, false));
        provider =
                new EncryptingStorageProvider(
                        inner, keyService, true, StorageEncryptionAuditListener.NOOP);

        Team team = new Team();
        team.setId(3L);
        owner = new User();
        owner.setId(1L);
        owner.setTeam(team);

        fileRepo = mock(StoredFileRepository.class);
        when(fileRepo.countByEncryptionKeyIdIsNull())
                .thenAnswer(
                        inv ->
                                rows.values().stream()
                                        .filter(f -> f.getEncryptionKeyId() == null)
                                        .count());
        when(fileRepo.findMigratableAfter(anyLong(), any(Pageable.class)))
                .thenAnswer(
                        inv -> {
                            long lastId = inv.getArgument(0);
                            Pageable p = inv.getArgument(1);
                            return rows.values().stream()
                                    .filter(f -> f.getEncryptionKeyId() == null)
                                    .filter(f -> f.getId() > lastId)
                                    .sorted(Comparator.comparing(StoredFile::getId))
                                    .limit(p.getPageSize())
                                    .toList();
                        });
        when(fileRepo.swapMainBlob(anyLong(), anyString(), anyString(), anyString()))
                .thenAnswer(
                        inv -> {
                            StoredFile f = rows.get(inv.<Long>getArgument(0));
                            if (f == null || !f.getStorageKey().equals(inv.getArgument(1))) {
                                return 0;
                            }
                            f.setStorageKey(inv.getArgument(2));
                            f.setEncryptionKeyId(inv.getArgument(3));
                            return 1;
                        });
        when(fileRepo.swapHistoryBlob(anyLong(), anyString(), anyString()))
                .thenAnswer(
                        inv -> {
                            StoredFile f = rows.get(inv.<Long>getArgument(0));
                            if (f == null || !inv.getArgument(1).equals(f.getHistoryStorageKey())) {
                                return 0;
                            }
                            f.setHistoryStorageKey(inv.getArgument(2));
                            return 1;
                        });

        service =
                new StorageEncryptionMigrationService(
                        fileRepo,
                        provider,
                        new StorageEncryptionState(
                                true, keyService, StorageEncryptionAuditListener.NOOP),
                        mock(AuditService.class));
    }

    private StoredFile plaintextFile(long id, boolean withHistory) throws Exception {
        StoredObject main =
                inner.store(
                        owner,
                        new MockMultipartFile(
                                "file", "doc" + id + ".pdf", "application/pdf", CONTENT));
        StoredFile f = new StoredFile();
        f.setId(id);
        f.setOwner(owner);
        f.setOriginalFilename("doc" + id + ".pdf");
        f.setContentType("application/pdf");
        f.setSizeBytes(CONTENT.length);
        f.setStorageKey(main.getStorageKey());
        if (withHistory) {
            StoredObject hist =
                    inner.store(
                            owner,
                            new MockMultipartFile(
                                    "file", "hist" + id + ".zip", "application/zip", CONTENT));
            f.setHistoryStorageKey(hist.getStorageKey());
            f.setHistoryFilename("hist" + id + ".zip");
            f.setHistoryContentType("application/zip");
            f.setHistorySizeBytes((long) CONTENT.length);
        }
        rows.put(id, f);
        return f;
    }

    private StorageEncryptionMigrationService.MigrationStatus awaitCompletion() throws Exception {
        for (int i = 0; i < 300; i++) {
            StorageEncryptionMigrationService.MigrationStatus s = service.status();
            if (s != null && s.state() != StorageEncryptionMigrationService.State.RUNNING) {
                return s;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("migration did not finish in time");
    }

    @Test
    void migrate_encryptsBacklogAndPreservesContent() throws Exception {
        plaintextFile(1, false);
        plaintextFile(2, true);

        service.start();
        StorageEncryptionMigrationService.MigrationStatus done = awaitCompletion();

        assertThat(done.state()).isEqualTo(StorageEncryptionMigrationService.State.COMPLETED);
        assertThat(done.processed()).isEqualTo(2);
        assertThat(done.failed()).isZero();

        for (StoredFile f : rows.values()) {
            assertThat(f.getEncryptionKeyId()).isNotNull();
            byte[] onDisk = Files.readAllBytes(tempDir.resolve(f.getStorageKey()));
            assertThat(new String(onDisk, 0, 8, StandardCharsets.US_ASCII)).isEqualTo("SPDFEAR1");
            try (var in = provider.load(f.getStorageKey()).getInputStream()) {
                assertThat(in.readAllBytes()).isEqualTo(CONTENT);
            }
            if (f.getHistoryStorageKey() != null) {
                byte[] hist = Files.readAllBytes(tempDir.resolve(f.getHistoryStorageKey()));
                assertThat(new String(hist, 0, 8, StandardCharsets.US_ASCII)).isEqualTo("SPDFEAR1");
            }
        }
        // Exactly one blob per storage key remains (old plaintext blobs were deleted).
        long blobCount;
        try (var stream = Files.walk(tempDir)) {
            blobCount = stream.filter(Files::isRegularFile).count();
        }
        assertThat(blobCount).isEqualTo(3);
    }

    @Test
    void migrate_casMiss_discardsOwnCopyAndSkips() throws Exception {
        plaintextFile(1, false);
        // Simulate a user replacing the file mid-migration: main-blob CAS always misses.
        when(fileRepo.swapMainBlob(anyLong(), anyString(), anyString(), anyString())).thenReturn(0);

        service.start();
        StorageEncryptionMigrationService.MigrationStatus done = awaitCompletion();

        assertThat(done.skipped()).isEqualTo(1);
        assertThat(done.processed()).isZero();
        StoredFile f = rows.get(1L);
        assertThat(f.getEncryptionKeyId()).isNull();
        // The user's blob is untouched and still loadable; the migration's copy is gone.
        byte[] onDisk = Files.readAllBytes(tempDir.resolve(f.getStorageKey()));
        assertThat(onDisk).isEqualTo(CONTENT);
        long blobCount;
        try (var stream = Files.walk(tempDir)) {
            blobCount = stream.filter(Files::isRegularFile).count();
        }
        assertThat(blobCount).isEqualTo(1);
    }

    @Test
    void start_secondConcurrentRun_rejected() throws Exception {
        for (long i = 1; i <= 30; i++) {
            plaintextFile(i, false);
        }
        service.start();
        assertThatThrownBy(service::start)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("already running");
        awaitCompletion();
        // After completion a new run is allowed again.
        service.start();
        awaitCompletion();
    }

    @Test
    void start_writeDisabled_rejected() {
        StorageEncryptionMigrationService disabled =
                new StorageEncryptionMigrationService(
                        fileRepo,
                        provider,
                        StorageEncryptionState.INACTIVE,
                        mock(AuditService.class));
        assertThatThrownBy(disabled::start)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("storage.encryption.enabled");
    }

    @Test
    void migrate_perFileFailure_countsAndContinues() throws Exception {
        StoredFile broken = plaintextFile(1, false);
        plaintextFile(2, false);
        // Point file 1 at a missing blob so its migration throws.
        broken.setStorageKey("1/does-not-exist");

        service.start();
        StorageEncryptionMigrationService.MigrationStatus done = awaitCompletion();

        assertThat(done.state()).isEqualTo(StorageEncryptionMigrationService.State.COMPLETED);
        assertThat(done.failed()).isEqualTo(1);
        assertThat(done.processed()).isEqualTo(1);
        assertThat(rows.get(2L).getEncryptionKeyId()).isNotNull();
    }
}
