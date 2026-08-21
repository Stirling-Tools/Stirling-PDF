package stirling.software.proprietary.policy.ledger;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Conditional updates for the processed-file ledger: each claim variant re-checks in its WHERE
 * clause the state it was decided against, so a racing claim loses cleanly with 0 rows updated.
 * Transactional per call so the ledger can run them without an enclosing transaction.
 */
@Repository
public interface ProcessedFileRepository
        extends JpaRepository<ProcessedFileEntity, ProcessedFileId> {

    /**
     * Re-claim a settled row at a new gate without content verification; clears the stored hash,
     * which described content this claim never checked.
     */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                    + " e.signature = :gate, e.contentHash = null, e.attempts = 1,"
                    + " e.lastSeen = :now, e.updatedAt = :now"
                    + " where e.policyId = :policyId and e.identityHash = :identityHash"
                    + " and e.status <>"
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING"
                    + " and e.signature <> :gate")
    int reclaimAtNewGate(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("gate") String gate,
            @Param("now") long now);

    /** Re-claim a settled row whose content verifiably changed (or was never hashed). */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                    + " e.signature = :gate, e.contentHash = :contentHash, e.attempts = 1,"
                    + " e.lastSeen = :now, e.updatedAt = :now"
                    + " where e.policyId = :policyId and e.identityHash = :identityHash"
                    + " and e.status <>"
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING"
                    + " and (e.contentHash is null or e.contentHash <> :contentHash)")
    int reclaimAtNewContent(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("gate") String gate,
            @Param("contentHash") String contentHash,
            @Param("now") long now);

    /** The gate moved but the content did not: track the new gate without changing status. */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.signature = :gate, e.lastSeen = :now,"
                    + " e.updatedAt = :now"
                    + " where e.policyId = :policyId and e.identityHash = :identityHash"
                    + " and e.status <>"
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING"
                    + " and e.contentHash = :contentHash and e.signature <> :gate")
    int refreshGate(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("gate") String gate,
            @Param("contentHash") String contentHash,
            @Param("now") long now);

    /** Bounded retry of an INTERRUPTED row at the same gate. */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                    + " e.attempts = e.attempts + 1, e.lastSeen = :now, e.updatedAt = :now"
                    + " where e.policyId = :policyId and e.identityHash = :identityHash"
                    + " and e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.INTERRUPTED"
                    + " and e.signature = :gate and e.attempts < :maxAttempts")
    int retryInterruptedAtGate(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("gate") String gate,
            @Param("maxAttempts") int maxAttempts,
            @Param("now") long now);

    /** Bounded retry of an INTERRUPTED row whose gate moved but whose content is unchanged. */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                    + " e.signature = :gate, e.attempts = e.attempts + 1, e.lastSeen = :now,"
                    + " e.updatedAt = :now"
                    + " where e.policyId = :policyId and e.identityHash = :identityHash"
                    + " and e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.INTERRUPTED"
                    + " and e.contentHash = :contentHash and e.attempts < :maxAttempts")
    int retryInterruptedSameContent(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("gate") String gate,
            @Param("contentHash") String contentHash,
            @Param("maxAttempts") int maxAttempts,
            @Param("now") long now);

    /**
     * Unconditional settle (only the claiming run settles a row); returns 0 when the row was
     * removed mid-run so the caller re-inserts.
     */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.status = :status, e.signature = :gate,"
                    + " e.contentHash = :contentHash, e.lastSeen = :now, e.updatedAt = :now"
                    + " where e.policyId = :policyId and e.identityHash = :identityHash")
    int settle(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("gate") String gate,
            @Param("contentHash") String contentHash,
            @Param("status") ProcessedFileStatus status,
            @Param("now") long now);

    /** Whether any policy's row at this identity is in a state other than {@code status}. */
    boolean existsByIdentityHashAndStatusNot(String identityHash, ProcessedFileStatus status);

    /** One policy's rows across a chunk of identity hashes, for a sweep's claim snapshot. */
    List<ProcessedFileEntity> findByPolicyIdAndIdentityHashIn(
            String policyId, Collection<String> identityHashes);

    /**
     * Remove an output record whose rename never landed, only while still settled exactly as
     * recorded; a row a claim has since taken over is left alone.
     */
    @Modifying
    @Transactional
    @Query(
            "delete from ProcessedFileEntity e where e.policyId = :policyId"
                    + " and e.identityHash = :identityHash and e.signature = :gate"
                    + " and e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.DONE")
    int deleteDoneAt(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("gate") String gate);

    /** Stamp presence for the given identities; chunked by the caller for very large folders. */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.lastSeen = :now"
                    + " where e.policyId = :policyId and e.identityHash in :identityHashes")
    int stampSeen(
            @Param("policyId") String policyId,
            @Param("identityHashes") Collection<String> identityHashes,
            @Param("now") long now);

    /**
     * Presence cleanup: remove rows not stamped since the sweep began, keeping in-flight claims.
     */
    @Modifying
    @Transactional
    @Query(
            "delete from ProcessedFileEntity e where e.policyId = :policyId"
                    + " and e.lastSeen < :cutoff and e.status <>"
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING")
    int deleteUnseen(@Param("policyId") String policyId, @Param("cutoff") long cutoff);

    @Modifying
    @Transactional
    @Query("delete from ProcessedFileEntity e where e.policyId = :policyId")
    int deleteByPolicy(@Param("policyId") String policyId);

    /** Boot recovery: after a restart every PROCESSING row is stale (single node). */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.INTERRUPTED,"
                    + " e.updatedAt = :now"
                    + " where e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING")
    int markAllProcessingInterrupted(@Param("now") long now);
}
