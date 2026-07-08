package stirling.software.proprietary.policy.ledger;

import java.util.Collection;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Conditional updates for the processed-file ledger. Each claim variant is a compare-and-swap: it
 * re-checks the state it was decided against in the WHERE clause and reports rows updated, so a
 * racing claim loses cleanly with 0. Transactional per call so {@code JpaProcessedLedger} can run
 * them (and the insert-race retry) without an enclosing transaction.
 */
@Repository
public interface ProcessedFileRepository
        extends JpaRepository<ProcessedFileEntity, ProcessedFileId> {

    /**
     * Re-claim a settled row (DONE / ERROR / INTERRUPTED) whose signature differs from the file's
     * current one: the file changed, so process the new version. Resets the attempt count.
     */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                    + " e.signature = :signature, e.attempts = 1, e.lastSeen = :now,"
                    + " e.updatedAt = :now"
                    + " where e.policyId = :policyId and e.identityHash = :identityHash"
                    + " and e.status <>"
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING"
                    + " and e.signature <> :signature")
    int reclaimAtNewSignature(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("signature") String signature,
            @Param("now") long now);

    /**
     * Retry an INTERRUPTED row at the same signature, bounded by {@code maxAttempts} so a file
     * whose run reliably kills the JVM cannot crash-loop it.
     */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.PROCESSING,"
                    + " e.attempts = e.attempts + 1, e.lastSeen = :now, e.updatedAt = :now"
                    + " where e.policyId = :policyId and e.identityHash = :identityHash"
                    + " and e.status ="
                    + " stirling.software.proprietary.policy.ledger.ProcessedFileStatus.INTERRUPTED"
                    + " and e.signature = :signature and e.attempts < :maxAttempts")
    int retryInterrupted(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("signature") String signature,
            @Param("maxAttempts") int maxAttempts,
            @Param("now") long now);

    /**
     * Settle a row at its final status and signature, unconditionally: within one JVM only the run
     * that claimed the row settles it, so the settle is authoritative. Returns 0 when the row was
     * removed mid-run (file deleted and presence-cleaned); the caller re-inserts.
     */
    @Modifying
    @Transactional
    @Query(
            "update ProcessedFileEntity e set e.status = :status, e.signature = :signature,"
                    + " e.lastSeen = :now, e.updatedAt = :now"
                    + " where e.policyId = :policyId and e.identityHash = :identityHash")
    int settle(
            @Param("policyId") String policyId,
            @Param("identityHash") String identityHash,
            @Param("signature") String signature,
            @Param("status") ProcessedFileStatus status,
            @Param("now") long now);

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
     * Presence cleanup: remove rows not stamped since the sweep began. Never removes an in-flight
     * claim (its settle would only resurrect a row that the next full sweep removes again).
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

    /**
     * Boot recovery: runs died with the JVM, so every PROCESSING row is stale. Assumes the single
     * node the folder-watch trigger already assumes.
     */
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
