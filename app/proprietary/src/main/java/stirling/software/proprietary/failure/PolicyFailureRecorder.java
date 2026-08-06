package stirling.software.proprietary.failure;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * The seam the policy engine calls when a run fails: classify, then record. Best-effort throughout,
 * so failing to write a row cannot change the failure the caller already observed.
 *
 * <p>The team comes from the originating policy rather than the calling thread, which carries only
 * an audit principal. An ad-hoc run has no stored policy, so its rows land unteamed.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyFailureRecorder {

    private final FailureClassifier classifier;
    private final FileRunEventStore store;
    private final PolicyStore policyStore;

    /**
     * Record a failed run, classifying {@code cause}. {@code detail} is the message the run itself
     * reported, kept verbatim so an {@link FailureKind#UNKNOWN} row is still diagnosable.
     */
    public void recordRunFailure(
            String runId,
            String policyId,
            String actor,
            String fileIdentity,
            String detail,
            Throwable cause) {
        record(classifier.classify(cause), runId, policyId, actor, fileIdentity, detail);
    }

    /**
     * Record a failure whose kind is already decided, for paths with no exception to classify (a
     * run rejected at admission). Named distinctly rather than overloading {@link
     * #recordRunFailure}, whose argument list is otherwise near-identical, so a null cause cannot
     * pick the wrong one.
     */
    public void recordRunFailureAs(
            FailureKind kind, String runId, String policyId, String actor, String detail) {
        record(kind, runId, policyId, actor, null, detail);
    }

    /**
     * The downstream message is kept only for a failure we could not classify, where it is the one
     * thing telling a reviewer what went wrong. A recognised kind already carries its own copy, so
     * the raw text adds nothing except somewhere for a document name to hide.
     */
    private static String diagnosticFor(FailureKind kind, String detail) {
        return kind == FailureKind.UNKNOWN ? detail : null;
    }

    private void record(
            FailureKind kind,
            String runId,
            String policyId,
            String actor,
            String fileIdentity,
            String detail) {
        try {
            store.record(
                    RecordFailure.forRun(
                            kind,
                            teamFor(policyId),
                            actor,
                            policyId,
                            runId,
                            fileIdentity,
                            diagnosticFor(kind, detail)));
        } catch (RuntimeException e) {
            // Deliberately swallowed: see the class comment.
            log.warn("Could not record failure event for run {} (kind {})", runId, kind.getId(), e);
        }
    }

    private Long teamFor(String policyId) {
        if (policyId == null || policyId.isBlank()) {
            return null;
        }
        try {
            return policyStore.get(policyId).map(policy -> policy.teamId()).orElse(null);
        } catch (RuntimeException e) {
            log.debug("Could not resolve team for policy {}: {}", policyId, e.getMessage());
            return null;
        }
    }
}
