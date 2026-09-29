package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.InputStreamResource;
import org.springframework.data.domain.Pageable;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.audit.AuditEventType;
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
    private FileEncryptionKeyService keyService;
    private User owner;

    @BeforeEach
    void setUp() {
        inner = new LocalStorageProvider(tempDir);
        keyService =
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
                        StorageEncryptionState.of(
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
            Optional<StorageEncryptionMigrationService.MigrationStatus> s = service.status();
            if (s.isPresent()
                    && s.get().state() != StorageEncryptionMigrationService.State.RUNNING) {
                return s.get();
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
                        new StorageEncryptionState(
                                false, () -> null, null, StorageEncryptionAuditListener.NOOP),
                        mock(AuditService.class));
        assertThatThrownBy(disabled::start)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("storage.encryption.enabled");
    }

    @Test
    void migrate_writeFlagOffMidRun_stopsFailedWithoutChurningTheRestOfTheBacklog()
            throws Exception {
        for (long i = 1; i <= 30; i++) { // more than one page, so the run has somewhere to churn
            plaintextFile(i, false);
        }
        AtomicBoolean writeEnabled = new AtomicBoolean(true);
        AtomicInteger stores = new AtomicInteger();
        // Flip the flag the instant the first file has been stored, exactly as an admin toggling
        // storage.encryption.enabled mid-run would.
        StorageProvider countingInner =
                new StorageProvider() {
                    @Override
                    public StoredObject store(User o, MultipartFile f) throws java.io.IOException {
                        StoredObject stored = inner.store(o, f);
                        if (stores.incrementAndGet() == 1) {
                            writeEnabled.set(false);
                        }
                        return stored;
                    }

                    @Override
                    public org.springframework.core.io.Resource load(String key)
                            throws java.io.IOException {
                        return inner.load(key);
                    }

                    @Override
                    public void delete(String key) throws java.io.IOException {
                        inner.delete(key);
                    }
                };
        StorageEncryptionState flippable = flippableState(writeEnabled);
        service =
                new StorageEncryptionMigrationService(
                        fileRepo,
                        new EncryptingStorageProvider(countingInner, flippable),
                        flippable,
                        mock(AuditService.class));

        service.start();
        StorageEncryptionMigrationService.MigrationStatus done = awaitCompletion();

        assertThat(done.state()).isEqualTo(StorageEncryptionMigrationService.State.FAILED);
        assertThat(done.processed()).isEqualTo(1);
        // The remaining 29 files were never re-stored, so nothing was written and deleted for
        // nothing, and none of them is counted as a failure.
        assertThat(stores.get()).isEqualTo(1);
        assertThat(done.failed()).isZero();
        assertThat(rows.values().stream().filter(f -> f.getEncryptionKeyId() == null).count())
                .isEqualTo(29);
    }

    @Test
    void start_auditsTheAdminWhoTriggeredIt_onStartAndCompletion() throws Exception {
        plaintextFile(1, false);
        AuditService audit = mock(AuditService.class);
        when(audit.captureCurrentPrincipal()).thenReturn("admin-alice");
        service =
                new StorageEncryptionMigrationService(
                        fileRepo,
                        provider,
                        StorageEncryptionState.of(
                                true, keyService, StorageEncryptionAuditListener.NOOP),
                        audit);

        service.start();
        awaitCompletion();

        // Both ends of the run must name the admin: the completion event runs on a virtual thread
        // with no security context, where the principal would otherwise resolve to "system".
        verify(audit)
                .audit(
                        eq("admin-alice"),
                        eq(AuditEventType.STORAGE_ENCRYPTION),
                        argThat(data -> "migration.started".equals(data.get("action"))));
        verify(audit)
                .audit(
                        eq("admin-alice"),
                        eq(AuditEventType.STORAGE_ENCRYPTION),
                        argThat(data -> "migration.completed".equals(data.get("action"))));
    }

    // ---- one-shot backends (S3, database) ------------------------------------------------

    /**
     * Wraps the local provider so {@code load} hands back a stock {@link InputStreamResource}: a
     * one-shot stream that refuses {@code contentLength()} once partially read, the way an S3 or
     * database resource behaves. Local files are re-openable and never exercise that branch.
     */
    private StorageProvider oneShotBacked() {
        return new StorageProvider() {
            @Override
            public StoredObject store(User o, MultipartFile f) throws java.io.IOException {
                return inner.store(o, f);
            }

            @Override
            public org.springframework.core.io.Resource load(String key)
                    throws java.io.IOException {
                return new InputStreamResource(inner.load(key).getInputStream());
            }

            @Override
            public void delete(String key) throws java.io.IOException {
                inner.delete(key);
            }
        };
    }

    private void useProvider(StorageProvider backing) {
        service =
                new StorageEncryptionMigrationService(
                        fileRepo,
                        new EncryptingStorageProvider(
                                backing,
                                StorageEncryptionState.of(
                                        true, keyService, StorageEncryptionAuditListener.NOOP)),
                        StorageEncryptionState.of(
                                true, keyService, StorageEncryptionAuditListener.NOOP),
                        mock(AuditService.class));
    }

    @Test
    void migrate_oneShotResource_fallsBackToTheRecordedSizeAndStillEncrypts() throws Exception {
        StoredFile file = plaintextFile(1, false);
        useProvider(oneShotBacked());

        service.start();
        StorageEncryptionMigrationService.MigrationStatus done = awaitCompletion();

        assertThat(done.state()).isEqualTo(StorageEncryptionMigrationService.State.COMPLETED);
        assertThat(done.processed()).isEqualTo(1);
        assertThat(file.getEncryptionKeyId()).isNotNull();
        byte[] onDisk = Files.readAllBytes(tempDir.resolve(file.getStorageKey()));
        assertThat(new String(onDisk, 0, 8, StandardCharsets.US_ASCII)).isEqualTo("SPDFEAR1");
        // Decrypting through a fresh load must return the original bytes, not a truncated stream.
        try (var in =
                new EncryptingStorageProvider(inner, keyService, true)
                        .load(file.getStorageKey())
                        .getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(CONTENT);
        }
    }

    @Test
    void migrate_oneShotResourceWithWrongRecordedSize_failsTheFileAndLeavesTheRowAlone()
            throws Exception {
        StoredFile file = plaintextFile(1, false);
        String originalKey = file.getStorageKey();
        file.setSizeBytes(CONTENT.length + 7L); // stale/incorrect row size
        useProvider(oneShotBacked());

        service.start();
        StorageEncryptionMigrationService.MigrationStatus done = awaitCompletion();

        // The size mismatch is caught inside store(), before the compare-and-swap, so the file is
        // counted as failed and the row still points at its untouched plaintext blob.
        assertThat(done.failed()).isEqualTo(1);
        assertThat(done.processed()).isZero();
        assertThat(file.getEncryptionKeyId()).isNull();
        assertThat(file.getStorageKey()).isEqualTo(originalKey);
        assertThat(Files.readAllBytes(tempDir.resolve(originalKey))).isEqualTo(CONTENT);
    }

    @Test
    void migrate_oneShotResourceWithNoRecordedSize_failsTheFileRatherThanGuessing()
            throws Exception {
        // Only the secondary blobs have a nullable size, so that is where "no size available at
        // all" is reachable: neither the resource nor the row can say how long the plaintext is.
        StoredFile file = plaintextFile(1, true);
        String historyKey = file.getHistoryStorageKey();
        file.setHistorySizeBytes(null);
        useProvider(oneShotBacked());

        service.start();
        StorageEncryptionMigrationService.MigrationStatus done = awaitCompletion();

        assertThat(done.failed()).isEqualTo(1);
        assertThat(done.processed()).isZero();
        assertThat(file.getEncryptionKeyId()).isNull();
        assertThat(file.getHistoryStorageKey()).isEqualTo(historyKey);
    }

    private StorageEncryptionState flippableState(AtomicBoolean writeEnabled) {
        return new StorageEncryptionState(
                true, () -> keyService, null, StorageEncryptionAuditListener.NOOP) {
            @Override
            public boolean isWriteEnabled() {
                return writeEnabled.get();
            }
        };
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
