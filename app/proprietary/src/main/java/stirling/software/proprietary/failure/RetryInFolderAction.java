package stirling.software.proprietary.failure;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.Policy;

/**
 * Run a smart folder's document again, unchanged; the client has no way to address the file. The
 * parked failure is the gate: a row with none is already handled, and refusing loses no work.
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
        return FailureActionId.RETRY_IN_FOLDER;
    }

    @Override
    public FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor) {
        Policy policy = fix.ownedFolderFor(event);
        String identity = fix.documentIdentity(event);

        if (!processedLedger.forgetFailure(policy.id(), identity)) {
            throw new FailureActionException(
                    FailureActionException.Reason.ALREADY_CLOSED,
                    "This document has no parked failure to run again");
        }
        policyRunner.runFile(policy, identity);

        // Closed on dispatch, not on the re-run's outcome: the run is asynchronous, and a repeat
        // failure records its own incident, which folds back onto this row by dedup key.
        return store.applyStatus(event.id(), event.teamId(), FileRunEventStatus.RESOLVED, actor);
    }
}
