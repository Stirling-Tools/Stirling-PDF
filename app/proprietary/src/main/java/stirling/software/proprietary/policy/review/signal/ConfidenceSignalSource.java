package stirling.software.proprietary.policy.review.signal;

import java.util.List;

import org.springframework.core.io.Resource;

/**
 * Extracts {@link ConfidenceSignal}s from one of a run's output files.
 *
 * <p>The review bucket's low-confidence rule is deliberately not classification-specific: it holds
 * a file when ANY step says it was unsure. Every implementation of this interface is consulted, so
 * teaching review about a new tool's confidence means adding one bean here and nothing else — no
 * change to {@code ReviewGate}, the config, the API, or the UI.
 *
 * <p>Two ways to become a producer:
 *
 * <ul>
 *   <li>Write {@code StirlingPDFSignals} into the PDF (see {@link MetadataConfidenceSource} for the
 *       shape). Costs no Java at all — any tool that can set metadata can opt in.
 *   <li>Implement this interface, for a tool whose confidence lives somewhere else (its own
 *       metadata key, a sidecar, the job ledger). {@link ClassificationConfidenceSource} does this,
 *       because classification's metadata predates the generic key.
 * </ul>
 *
 * <p>Implementations must be cheap and must never throw: an unreadable output has to leave the run
 * deliverable, not fail it.
 */
public interface ConfidenceSignalSource {

    /** Short token identifying this producer, mirrored onto {@link ConfidenceSignal#producer()}. */
    String producer();

    /** Signals found on this output; empty when the producer left nothing behind. */
    List<ConfidenceSignal> read(Resource output);
}
