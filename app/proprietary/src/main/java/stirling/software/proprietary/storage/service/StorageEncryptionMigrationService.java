package stirling.software.proprietary.storage.service;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.storage.crypto.ResourceUpload;
import stirling.software.proprietary.storage.crypto.StorageEncryptionState;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Encrypts the pre-existing plaintext backlog after storage encryption is enabled (new writes are
 * encrypted from the moment the flag is on; this job converts what was stored before).
 *
 * <p>Crash-safe per file: store the encrypted copy under a NEW storage key, compare-and-swap the
 * row, and only then delete the old blob. A CAS miss means a user replaced the file mid-migration —
 * the job discards its own copy and moves on. The worst crash outcome is an orphaned new blob,
 * never a lost file, and re-runs are idempotent because selection is {@code encryptionKeyId IS
 * NULL} (only stamped by the final main-blob swap).
 */
@Service
@Slf4j
public class StorageEncryptionMigrationService {

    private static final int PAGE_SIZE = 25;
    private static final long PAUSE_BETWEEN_PAGES_MS = 200;

    private final StoredFileRepository storedFileRepository;
    private final StorageProvider storageProvider;
    private final StorageEncryptionState encryptionState;
    private final AuditService auditService;

    private final AtomicReference<Run> currentRun = new AtomicReference<>();

    public StorageEncryptionMigrationService(
            StoredFileRepository storedFileRepository,
            StorageProvider storageProvider,
            StorageEncryptionState encryptionState,
            AuditService auditService) {
        this.storedFileRepository = storedFileRepository;
        this.storageProvider = storageProvider;
        this.encryptionState = encryptionState;
        this.auditService = auditService;
    }

    public enum State {
        RUNNING,
        COMPLETED,
        FAILED
    }

    public record MigrationStatus(
            State state,
            long total,
            long processed,
            long skipped,
            long failed,
            Instant startedAt,
            Instant finishedAt) {}

    /** Starts the migration; throws {@link IllegalStateException} if one is already running. */
    public MigrationStatus start() {
        if (!encryptionState.isWriteEnabled()) {
            throw new IllegalStateException(
                    "storage.encryption.enabled must be on before migrating existing files");
        }
        // Captured here because the run itself executes on a virtual thread with no security
        // context: without this, re-encrypting every stored file is attributed to "system".
        String principal = auditService.captureCurrentPrincipal();
        Run run = new Run(storedFileRepository.countByEncryptionKeyIdIsNull(), principal);
        Run previous = currentRun.get();
        if (previous != null && previous.state == State.RUNNING) {
            throw new IllegalStateException("A migration is already running");
        }
        if (!currentRun.compareAndSet(previous, run)) {
            throw new IllegalStateException("A migration is already running");
        }
        auditService.audit(
                principal,
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of("action", "migration.started", "plaintextFiles", run.total));
        Thread.ofVirtual().name("storage-encryption-migration").start(() -> execute(run));
        return run.snapshot();
    }

    /** Latest run's progress, or empty if none has started this uptime. */
    public Optional<MigrationStatus> status() {
        Run run = currentRun.get();
        return Optional.ofNullable(run).map(Run::snapshot);
    }

    private void execute(Run run) {
        log.info("Storage encryption migration started ({} plaintext files)", run.total);
        State terminal;
        try {
            terminal = migratePages(run);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Storage encryption migration interrupted");
            terminal = State.FAILED;
        } catch (Exception e) {
            log.error("Storage encryption migration aborted", e);
            terminal = State.FAILED;
        }
        run.finish(terminal);
        MigrationStatus done = run.snapshot();
        log.info(
                "Storage encryption migration finished: {} encrypted, {} skipped, {} failed",
                done.processed(),
                done.skipped(),
                done.failed());
        auditService.audit(
                run.principal,
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of(
                        "action", "migration.completed",
                        "state", done.state().name(),
                        "encrypted", done.processed(),
                        "skipped", done.skipped(),
                        "failed", done.failed()));
    }

    /** Walks the plaintext backlog a page at a time; returns the state the run ends in. */
    private State migratePages(Run run) throws InterruptedException {
        long lastId = 0;
        while (true) {
            List<StoredFile> page =
                    storedFileRepository.findMigratableAfter(lastId, PageRequest.of(0, PAGE_SIZE));
            if (page.isEmpty()) {
                return State.COMPLETED;
            }
            for (StoredFile file : page) {
                if (!encryptionState.isWriteEnabled()) {
                    // Run-level condition, not a per-file failure: carrying on would copy every
                    // remaining file as plaintext and delete it again.
                    log.warn(
                            "Encryption write path turned off mid-run; stopping with {} of {} files"
                                    + " encrypted. Re-enable storage.encryption.enabled and start"
                                    + " the migration again.",
                            run.processed.get(),
                            run.total);
                    return State.FAILED;
                }
                lastId = file.getId();
                try {
                    migrateFile(file, run);
                } catch (Exception e) {
                    run.failed.incrementAndGet();
                    log.error(
                            "Failed to encrypt stored file {} (key {})",
                            file.getId(),
                            file.getStorageKey(),
                            e);
                }
            }
            Thread.sleep(PAUSE_BETWEEN_PAGES_MS);
        }
    }

    /**
     * The three blobs are swapped independently, so a compare-and-swap miss on a secondary one
     * abandons the whole file for this run: the row keeps {@code encryptionKeyId} null and the next
     * run picks it up from the top.
     */
    private void migrateFile(StoredFile file, Run run) throws IOException {
        User owner = file.getOwner();

        // Secondary blobs first; the main-blob swap stamps encryptionKeyId and thereby removes
        // the row from the migration's selection, so it must come last.
        if (file.getHistoryStorageKey() != null) {
            String oldKey = file.getHistoryStorageKey();
            String newKey =
                    reencrypt(
                                    owner,
                                    oldKey,
                                    file.getHistoryFilename(),
                                    file.getHistoryContentType(),
                                    file.getHistorySizeBytes())
                            .getStorageKey();
            if (storedFileRepository.swapHistoryBlob(file.getId(), oldKey, newKey) == 1) {
                deleteQuietly(oldKey);
            } else {
                deleteQuietly(newKey);
                run.skipped.incrementAndGet();
                return;
            }
        }
        if (file.getAuditLogStorageKey() != null) {
            String oldKey = file.getAuditLogStorageKey();
            String newKey =
                    reencrypt(
                                    owner,
                                    oldKey,
                                    file.getAuditLogFilename(),
                                    file.getAuditLogContentType(),
                                    file.getAuditLogSizeBytes())
                            .getStorageKey();
            if (storedFileRepository.swapAuditLogBlob(file.getId(), oldKey, newKey) == 1) {
                deleteQuietly(oldKey);
            } else {
                deleteQuietly(newKey);
                run.skipped.incrementAndGet();
                return;
            }
        }

        String oldKey = file.getStorageKey();
        StoredObject encrypted =
                reencrypt(
                        owner,
                        oldKey,
                        file.getOriginalFilename(),
                        file.getContentType(),
                        file.getSizeBytes());
        if (encrypted.getEncryptionKeyId() == null) {
            // The flag flipped between this page's check and the store; the loop stops on the next
            // file, so this only ever discards one plaintext copy.
            deleteQuietly(encrypted.getStorageKey());
            throw new IllegalStateException("Encryption write path is no longer active");
        }
        if (storedFileRepository.swapMainBlob(
                        file.getId(),
                        oldKey,
                        encrypted.getStorageKey(),
                        encrypted.getEncryptionKeyId())
                == 1) {
            deleteQuietly(oldKey);
            run.processed.incrementAndGet();
        } else {
            deleteQuietly(encrypted.getStorageKey());
            run.skipped.incrementAndGet();
        }
    }

    private StoredObject reencrypt(
            User owner, String storageKey, String filename, String contentType, Long sizeBytes)
            throws IOException {
        Resource plaintext = storageProvider.load(storageKey);
        long size = -1;
        try {
            size = plaintext.contentLength();
        } catch (IOException | RuntimeException e) {
            // Some resources refuse contentLength() once partially read.
            size = -1;
        }
        if (size < 0) {
            // A resource may also simply report -1; the row's recorded plaintext size is
            // authoritative, so prefer it over failing the file.
            size = sizeBytes != null ? sizeBytes : -1;
        }
        if (size < 0) {
            throw new IOException("Cannot determine plaintext size for " + storageKey);
        }
        return storageProvider.store(
                owner, new ResourceUpload(plaintext, filename, contentType, size));
    }

    private void deleteQuietly(String storageKey) {
        try {
            storageProvider.delete(storageKey);
        } catch (IOException e) {
            log.warn("Could not delete blob {} after migration step; orphaned", storageKey, e);
        }
    }

    private static final class Run {
        private final long total;

        /** The admin who started the run, so the completion event is attributed to them. */
        private final String principal;

        private final Instant startedAt = Instant.now();
        private final AtomicLong processed = new AtomicLong();
        private final AtomicLong skipped = new AtomicLong();
        private final AtomicLong failed = new AtomicLong();
        private volatile State state = State.RUNNING;
        private volatile Instant finishedAt;

        private Run(long total, String principal) {
            this.total = total;
            this.principal = principal;
        }

        private void finish(State terminal) {
            this.state = terminal;
            this.finishedAt = Instant.now();
        }

        private MigrationStatus snapshot() {
            return new MigrationStatus(
                    state,
                    total,
                    processed.get(),
                    skipped.get(),
                    failed.get(),
                    startedAt,
                    finishedAt);
        }
    }
}
