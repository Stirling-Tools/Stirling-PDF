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
 * Durable {@link ProcessedLedger}; the runtime bean. A fresh claim is a flushed insert so a
 * concurrent winner surfaces as a constraint violation; every other transition is a conditional
 * update that re-checks the observed state, so a lost race reports 0 rows and the caller skips.
 * Boot recovery assumes the single node the folder-watch trigger assumes: runs live in memory, so
 * after a restart every PROCESSING row is stale.
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
    public boolean claim(
            String policyId, String identity, String gate, Supplier<String> contentHash) {
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
                                gate,
                                contentHash == null ? null : contentHash.get(),
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
        if (gate.equals(row.getSignature())) {
            if (row.getStatus() == ProcessedFileStatus.INTERRUPTED) {
                return repository.retryInterruptedAtGate(
                                policyId, identityHash, gate, MAX_ATTEMPTS, now)
                        > 0;
            }
            return false;
        }
        if (contentHash == null) {
            return repository.reclaimAtNewGate(policyId, identityHash, gate, now) > 0;
        }
        String hash = contentHash.get();
        if (hash.equals(row.getContentHash())) {
            if (row.getStatus() == ProcessedFileStatus.INTERRUPTED) {
                return repository.retryInterruptedSameContent(
                                policyId, identityHash, gate, hash, MAX_ATTEMPTS, now)
                        > 0;
            }
            repository.refreshGate(policyId, identityHash, gate, hash, now);
            return false;
        }
        return repository.reclaimAtNewContent(policyId, identityHash, gate, hash, now) > 0;
    }

    @Override
    public void settle(
            String policyId,
            String identity,
            String finalGate,
            String finalContentHash,
            boolean success) {
        upsertSettled(
                policyId,
                identity,
                finalGate,
                finalContentHash,
                success ? ProcessedFileStatus.DONE : ProcessedFileStatus.ERROR);
    }

    @Override
    public void recordOutput(String policyId, String identity, String gate, String contentHash) {
        upsertSettled(policyId, identity, gate, contentHash, ProcessedFileStatus.DONE);
    }

    /**
     * Settle-or-insert: the row may have been presence-cleaned mid-run, and an output row may be
     * brand new.
     */
    private void upsertSettled(
            String policyId,
            String identity,
            String gate,
            String contentHash,
            ProcessedFileStatus status) {
        String identityHash = FolderIdentities.identityHash(identity);
        long now = nowMillis.get();
        if (repository.settle(policyId, identityHash, gate, contentHash, status, now) > 0) {
            return;
        }
        try {
            ProcessedFileEntity row =
                    new ProcessedFileEntity(
                            policyId, identityHash, identity, gate, contentHash, status, now);
            repository.saveAndFlush(row);
        } catch (DataIntegrityViolationException concurrentInsert) {
            repository.settle(policyId, identityHash, gate, contentHash, status, now);
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
