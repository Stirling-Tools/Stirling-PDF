package stirling.software.proprietary.policy.ledger;

import java.util.Collection;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Parameters;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/**
 * Conditional updates for the processed-file ledger: each claim variant re-checks in its WHERE
 * clause the state it was decided against, so a racing claim loses cleanly with 0 rows updated.
 * Transactional per call so the ledger can run them without an enclosing transaction.
 */
@ApplicationScoped
public class ProcessedFileRepository
        implements PanacheRepositoryBase<ProcessedFileEntity, ProcessedFileId> {

    /**
     * Re-claim a settled row at a new gate without content verification; clears the stored hash,
     * which described content this claim never checked.
     */
    @Transactional
    public int reclaimAtNewGate(String policyId, String identityHash, String gate, long now) {
        return update(
                "update ProcessedFileEntity e set e.status ="
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                        + " e.signature = :gate, e.contentHash = null, e.attempts = 1,"
                        + " e.lastSeen = :now, e.updatedAt = :now"
                        + " where e.policyId = :policyId and e.identityHash = :identityHash"
                        + " and e.status <>"
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING"
                        + " and e.signature <> :gate",
                Parameters.with("policyId", policyId)
                        .and("identityHash", identityHash)
                        .and("gate", gate)
                        .and("now", now));
    }

    /** Re-claim a settled row whose content verifiably changed (or was never hashed). */
    @Transactional
    public int reclaimAtNewContent(
            String policyId, String identityHash, String gate, String contentHash, long now) {
        return update(
                "update ProcessedFileEntity e set e.status ="
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                        + " e.signature = :gate, e.contentHash = :contentHash, e.attempts = 1,"
                        + " e.lastSeen = :now, e.updatedAt = :now"
                        + " where e.policyId = :policyId and e.identityHash = :identityHash"
                        + " and e.status <>"
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING"
                        + " and (e.contentHash is null or e.contentHash <> :contentHash)",
                Parameters.with("policyId", policyId)
                        .and("identityHash", identityHash)
                        .and("gate", gate)
                        .and("contentHash", contentHash)
                        .and("now", now));
    }

    /** The gate moved but the content did not: track the new gate without changing status. */
    @Transactional
    public int refreshGate(
            String policyId, String identityHash, String gate, String contentHash, long now) {
        return update(
                "update ProcessedFileEntity e set e.signature = :gate, e.lastSeen = :now,"
                        + " e.updatedAt = :now"
                        + " where e.policyId = :policyId and e.identityHash = :identityHash"
                        + " and e.status <>"
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING"
                        + " and e.contentHash = :contentHash and e.signature <> :gate",
                Parameters.with("policyId", policyId)
                        .and("identityHash", identityHash)
                        .and("gate", gate)
                        .and("contentHash", contentHash)
                        .and("now", now));
    }

    /** Bounded retry of an INTERRUPTED row at the same gate. */
    @Transactional
    public int retryInterruptedAtGate(
            String policyId, String identityHash, String gate, int maxAttempts, long now) {
        return update(
                "update ProcessedFileEntity e set e.status ="
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                        + " e.attempts = e.attempts + 1, e.lastSeen = :now, e.updatedAt = :now"
                        + " where e.policyId = :policyId and e.identityHash = :identityHash"
                        + " and e.status ="
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.INTERRUPTED"
                        + " and e.signature = :gate and e.attempts < :maxAttempts",
                Parameters.with("policyId", policyId)
                        .and("identityHash", identityHash)
                        .and("gate", gate)
                        .and("maxAttempts", maxAttempts)
                        .and("now", now));
    }

    /** Bounded retry of an INTERRUPTED row whose gate moved but whose content is unchanged. */
    @Transactional
    public int retryInterruptedSameContent(
            String policyId,
            String identityHash,
            String gate,
            String contentHash,
            int maxAttempts,
            long now) {
        return update(
                "update ProcessedFileEntity e set e.status ="
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                        + " e.signature = :gate, e.attempts = e.attempts + 1, e.lastSeen = :now,"
                        + " e.updatedAt = :now"
                        + " where e.policyId = :policyId and e.identityHash = :identityHash"
                        + " and e.status ="
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.INTERRUPTED"
                        + " and e.contentHash = :contentHash and e.attempts < :maxAttempts",
                Parameters.with("policyId", policyId)
                        .and("identityHash", identityHash)
                        .and("gate", gate)
                        .and("contentHash", contentHash)
                        .and("maxAttempts", maxAttempts)
                        .and("now", now));
    }

    /**
     * Unconditional settle (only the claiming run settles a row); returns 0 when the row was
     * removed mid-run so the caller re-inserts.
     */
    @Transactional
    public int settle(
            String policyId,
            String identityHash,
            String gate,
            String contentHash,
            ProcessedFileStatus status,
            long now) {
        return update(
                "update ProcessedFileEntity e set e.status = :status, e.signature = :gate,"
                        + " e.contentHash = :contentHash, e.lastSeen = :now, e.updatedAt = :now"
                        + " where e.policyId = :policyId and e.identityHash = :identityHash",
                Parameters.with("policyId", policyId)
                        .and("identityHash", identityHash)
                        .and("gate", gate)
                        .and("contentHash", contentHash)
                        .and("status", status)
                        .and("now", now));
    }

    /** Whether any policy's row at this identity is in a state other than {@code status}. */
    @Transactional
    public boolean existsByIdentityHashAndStatusNot(
            String identityHash, ProcessedFileStatus status) {
        return count("identityHash = ?1 and status <> ?2", identityHash, status) > 0;
    }

    /** One policy's rows across a chunk of identity hashes, for a sweep's claim snapshot. */
    @Transactional
    public List<ProcessedFileEntity> findByPolicyIdAndIdentityHashIn(
            String policyId, Collection<String> identityHashes) {
        return list("policyId = ?1 and identityHash in ?2", policyId, identityHashes);
    }

    /**
     * Remove an output record whose rename never landed, only while still settled exactly as
     * recorded; a row a claim has since taken over is left alone.
     */
    @Transactional
    public int deleteDoneAt(String policyId, String identityHash, String gate) {
        return (int)
                delete(
                        "delete from ProcessedFileEntity e where e.policyId = :policyId"
                                + " and e.identityHash = :identityHash and e.signature = :gate"
                                + " and e.status ="
                                + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.DONE",
                        Parameters.with("policyId", policyId)
                                .and("identityHash", identityHash)
                                .and("gate", gate));
    }

    /** Stamp presence for the given identities; chunked by the caller for very large folders. */
    @Transactional
    public int stampSeen(String policyId, Collection<String> identityHashes, long now) {
        return update(
                "update ProcessedFileEntity e set e.lastSeen = :now"
                        + " where e.policyId = :policyId and e.identityHash in :identityHashes",
                Parameters.with("policyId", policyId)
                        .and("identityHashes", identityHashes)
                        .and("now", now));
    }

    /**
     * Presence cleanup: remove rows not stamped since the sweep began, keeping in-flight claims.
     */
    @Transactional
    public int deleteUnseen(String policyId, long cutoff) {
        return (int)
                delete(
                        "delete from ProcessedFileEntity e where e.policyId = :policyId"
                                + " and e.lastSeen < :cutoff and e.status <>"
                                + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING",
                        Parameters.with("policyId", policyId).and("cutoff", cutoff));
    }

    @Transactional
    public int deleteByPolicy(String policyId) {
        return (int)
                delete(
                        "delete from ProcessedFileEntity e where e.policyId = :policyId",
                        Parameters.with("policyId", policyId));
    }

    /** Boot recovery: after a restart every PROCESSING row is stale (single node). */
    @Transactional
    public int markAllProcessingInterrupted(long now) {
        return update(
                "update ProcessedFileEntity e set e.status ="
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.INTERRUPTED,"
                        + " e.updatedAt = :now"
                        + " where e.status ="
                        + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING",
                Parameters.with("now", now));
    }

    /**
     * Spring Data's {@code saveAndFlush}: persist always INSERTs, as the entity's insert-only
     * contract requires, and the flush surfaces a concurrent insert's constraint violation here.
     */
    @Transactional
    public ProcessedFileEntity saveAndFlush(ProcessedFileEntity row) {
        persistAndFlush(row);
        return row;
    }
}
