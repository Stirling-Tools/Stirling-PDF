package stirling.software.proprietary.failure;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.ledger.ClaimState;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.Policy;

/**
 * The server's half of {@link FailureActionId#OPEN_IN_TOOL}: run a smart folder's document again,
 * unchanged; the client has no way to address the file. The parked failure is the gate: a row with
 * none is already handled, and refusing loses no work.
 */
@Component
@RequiredArgsConstructor
public class RetryInFolderAction implements FailureAction {

    private final FolderDocumentFix fix;
    private final ProcessedLedger processedLedger;
    private final PolicyRunner policyRunner;
    private final FileRunEventStore store;

    @Override
    public FailureActionId id() {
        return FailureActionId.OPEN_IN_TOOL;
    }

    @Override
    public FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor) {
        Policy policy = fix.ownedFolderFor(event);
        String identity = fix.documentIdentity(event);

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
}
