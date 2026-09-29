package stirling.software.proprietary.failure;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.ledger.ClaimState;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Server's half of {@link FailureActionId#OPEN_IN_TOOL}: reruns a smart folder's document. {@link
 * PolicyAccessGuard#canAccess} on the caller, not the row's actor, is the whole check.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RetryInFolderAction implements FailureAction {

    private final PolicyStore policyStore;
    private final PolicyAccessGuard policyAccessGuard;
    private final ProcessedLedger processedLedger;
    private final PolicyRunner policyRunner;
    private final FileRunEventStore store;

    @Override
    public FailureActionId id() {
        return FailureActionId.OPEN_IN_TOOL;
    }

    @Override
    public FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor) {
        Policy policy = ownedFolderFor(event);
        String identity = event.fileId();
        if (identity == null || identity.isBlank()) {
            throw new FailureActionException(
                    FailureActionException.Reason.ACTION_NOT_DECLARED,
                    "This failure names no document to run again");
        }

        // Taken from the row, never from the caller: the one file this incident is about is the
        // only one a press can reach, so no input can widen it to a sibling or to another folder.
        ClaimState parked = processedLedger.statesFor(policy.id(), List.of(identity)).get(identity);
        if (!processedLedger.forgetFailure(policy.id(), identity)) {
            throw new FailureActionException(
                    FailureActionException.Reason.NOTHING_TO_RUN,
                    "This document has no parked failure to run again");
        }
        SweepOutcome outcome = policyRunner.runFile(policy, identity);
        // A paused or unreadable folder, a missing licence, or a file that has since left the
        // folder all yield no run. The row stays open, and the failure is parked again at the
        // gate it had, so the next press finds something to run rather than "no parked failure".
        if (outcome.runIds().isEmpty()) {
            if (parked != null) {
                processedLedger.settle(
                        policy.id(), identity, parked.gate(), parked.contentHash(), false);
            }
            throw new FailureActionException(
                    FailureActionException.Reason.NOTHING_TO_RUN,
                    "This document could not be run again: the folder is paused, unreadable, or"
                            + " no longer holds it");
        }

        // Closed on dispatch, not on the re-run's outcome: the run is asynchronous, and a repeat
        // failure records its own incident, which folds back onto this row by dedup key.
        return store.applyStatus(event.id(), event.teamId(), FileRunEventStatus.RESOLVED, actor);
    }

    /**
     * The folder this row came from, if the caller owns it. Every refusal is the same {@code
     * EVENT_NOT_FOUND}, so a caller cannot tell a folder that is not theirs from one that is gone.
     */
    private Policy ownedFolderFor(FileRunEvent event) {
        if (event.policyId() == null || event.policyId().isBlank()) {
            throw notTheirs(event);
        }
        return policyStore
                .get(event.policyId())
                .filter(policy -> Policy.SURFACE_PROCESSING_FOLDER.equals(policy.surface()))
                .filter(policyAccessGuard::canAccess)
                .orElseThrow(() -> notTheirs(event));
    }

    private FailureActionException notTheirs(FileRunEvent event) {
        log.debug("Refused a folder retry on event {} (policy {})", event.id(), event.policyId());
        return new FailureActionException(
                FailureActionException.Reason.EVENT_NOT_FOUND,
                "No smart folder to run this document in");
    }
}
