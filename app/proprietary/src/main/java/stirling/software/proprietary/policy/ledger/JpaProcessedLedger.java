package stirling.software.proprietary.policy.ledger;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Durable {@link ProcessedLedger}; the runtime bean. Claims are atomic without a filesystem move: a
 * fresh claim is an insert flushed immediately (in its own transaction, since these methods are not
 * {@code @Transactional}) so a concurrent sweep's winning insert surfaces as a constraint
 * violation, and every other transition is a conditional update that re-checks the observed state,
 * so a lost race reports 0 rows and the caller simply skips. Boot recovery flips claims stranded by
 * a JVM death to INTERRUPTED - runs live in memory, so after a restart every PROCESSING row is
 * stale by definition (single node, as the folder-watch trigger already assumes).
 */
@Slf4j
@Service
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class JpaProcessedLedger implements ProcessedLedger {

    private static final int STAMP_CHUNK = 500;

    private final ProcessedFileRepository repository;
    private final Supplier<Long> nowMillis;

    @Autowired
    public JpaProcessedLedger(ProcessedFileRepository repository) {
        this(repository, System::currentTimeMillis);
    }

    // Clock seam so tests can pin "now"; the runtime bean uses the wall clock above.
    JpaProcessedLedger(ProcessedFileRepository repository, Supplier<Long> nowMillis) {
        this.repository = repository;
        this.nowMillis = nowMillis;
    }

    @Override
    public boolean claim(String policyId, String identity, String signature) {
        String identityHash = FolderIdentities.identityHash(identity);
        long now = nowMillis.get();
        Optional<ProcessedFileEntity> existing =
                repository.findById(new ProcessedFileId(policyId, identityHash));
        if (existing.isEmpty()) {
            try {
                repository.saveAndFlush(
                        new ProcessedFileEntity(
                                policyId,
                                identityHash,
                                identity,
                                signature,
                                ProcessedFileStatus.PROCESSING,
                                now));
                return true;
            } catch (DataIntegrityViolationException concurrentClaim) {
                return false;
            }
        }
        ProcessedFileEntity row = existing.get();
        if (row.getStatus() == ProcessedFileStatus.PROCESSING) {
            return false;
        }
        if (!signature.equals(row.getSignature())) {
            return repository.reclaimAtNewSignature(policyId, identityHash, signature, now) > 0;
        }
        if (row.getStatus() == ProcessedFileStatus.INTERRUPTED) {
            return repository.retryInterrupted(policyId, identityHash, signature, MAX_ATTEMPTS, now)
                    > 0;
        }
        return false;
    }

    @Override
    public void settle(String policyId, String identity, String finalSignature, boolean success) {
        upsertSettled(
                policyId,
                identity,
                finalSignature,
                success ? ProcessedFileStatus.DONE : ProcessedFileStatus.ERROR);
    }

    @Override
    public void recordOutput(String policyId, String identity, String signature) {
        upsertSettled(policyId, identity, signature, ProcessedFileStatus.DONE);
    }

    /**
     * Settle-or-insert: the row normally exists (claim created it), but presence cleanup may have
     * removed it mid-run (file deleted while processing), and an output row may be brand new. The
     * insert is flushed so a concurrent winner surfaces as a constraint violation we retry as the
     * update.
     */
    private void upsertSettled(
            String policyId, String identity, String signature, ProcessedFileStatus status) {
        String identityHash = FolderIdentities.identityHash(identity);
        long now = nowMillis.get();
        if (repository.settle(policyId, identityHash, signature, status, now) > 0) {
            return;
        }
        try {
            ProcessedFileEntity row =
                    new ProcessedFileEntity(
                            policyId, identityHash, identity, signature, status, now);
            repository.saveAndFlush(row);
        } catch (DataIntegrityViolationException concurrentInsert) {
            repository.settle(policyId, identityHash, signature, status, now);
        }
    }

    @Override
    public void markSeen(String policyId, Collection<String> identities) {
        if (identities.isEmpty()) {
            return;
        }
        List<String> hashes = identities.stream().map(FolderIdentities::identityHash).toList();
        long now = nowMillis.get();
        for (int from = 0; from < hashes.size(); from += STAMP_CHUNK) {
            repository.stampSeen(
                    policyId,
                    hashes.subList(from, Math.min(from + STAMP_CHUNK, hashes.size())),
                    now);
        }
    }

    @Override
    public int deleteUnseen(String policyId, long seenSinceMillis) {
        return repository.deleteUnseen(policyId, seenSinceMillis);
    }

    @Override
    public void clearPolicy(String policyId) {
        repository.deleteByPolicy(policyId);
    }

    @Override
    @EventListener(ApplicationReadyEvent.class)
    public void recoverInterrupted() {
        int recovered = repository.markAllProcessingInterrupted(nowMillis.get());
        if (recovered > 0) {
            log.info("Recovered {} policy input file(s) interrupted by shutdown", recovered);
        }
    }
}
