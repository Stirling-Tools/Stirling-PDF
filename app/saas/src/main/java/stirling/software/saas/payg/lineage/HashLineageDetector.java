package stirling.software.saas.payg.lineage;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import stirling.software.saas.payg.model.ArtifactKind;

/**
 * High-level lineage API. Decides whether a tool call should join an existing open process by
 * comparing the incoming file's signatures against signatures previously recorded for that user's
 * open processes.
 *
 * <p>Two operations:
 *
 * <ul>
 *   <li>{@link #detect} — pre-execution. Caller asks "for this user about to run a tool on this
 *       file, is there an open process to join?"
 *   <li>{@link #record} — post-execution (for outputs) or post-charge (for inputs). Caller records
 *       the file's signatures against the job so subsequent tool calls can lineage-match on it.
 * </ul>
 *
 * <p>Both methods take a {@link Path}; the caller is expected to have already materialised the
 * upload / response body to a managed temp file (via {@code TempFileManager}). The detector
 * delegates signature extraction to one or more {@link LineageSignatureExtractor}s and storage to a
 * {@link JobLineageStore}, both of which are swappable.
 */
public interface HashLineageDetector {

    /** Looks up an open process for this user whose recorded signatures match the input file. */
    Optional<LineageMatch> detect(Long userId, Path inputFile) throws IOException;

    /** Records the file's signatures against the given job as either INPUT or OUTPUT. */
    void record(UUID jobId, Path file, ArtifactKind kind) throws IOException;

    /**
     * Pre-computes the signature set for {@code file} so callers can avoid hashing the same bytes
     * twice when they need both {@link #detect} and {@link #record} for the same file. Returned set
     * may be empty (no extractor recognised the content) — treat as "no signatures to match or
     * record" by both consumers.
     */
    Set<LineageSignature> extractSignatures(Path file);

    /**
     * Same as {@link #detect(Long, Path)} but operating on pre-computed signatures. Useful when the
     * caller has already extracted them (e.g. via {@link #extractSignatures}) and wants to avoid
     * re-hashing. Empty {@code signatures} short-circuits to {@link Optional#empty}.
     */
    Optional<LineageMatch> detect(Long userId, Set<LineageSignature> signatures);

    /**
     * Same as {@link #record(UUID, Path, ArtifactKind)} but operating on pre-computed signatures.
     * Empty {@code signatures} is a no-op.
     */
    void record(UUID jobId, Set<LineageSignature> signatures, ArtifactKind kind);
}
