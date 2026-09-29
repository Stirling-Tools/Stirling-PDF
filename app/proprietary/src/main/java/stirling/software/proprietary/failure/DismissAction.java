package stirling.software.proprietary.failure;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * "No remediation will happen; close it." Terminal. Named Dismiss rather than Reject because it
 * closes the incident, not the document: nothing is deleted or delivered, the ledger row is left
 * alone, and a different file failing the same way still opens its own incident.
 *
 * <p>Recurrences of this exact failure fold onto the dismissed row, which is what makes "stop
 * showing me this" hold for a source that re-lists the same failing file each sweep.
 */
@Component
@RequiredArgsConstructor
public class DismissAction implements FailureAction {

    private final FileRunEventStore store;

    @Override
    public FailureActionId id() {
        return FailureActionId.DISMISS;
    }

    @Override
    public FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor) {
        return store.applyStatus(event.id(), event.teamId(), FileRunEventStatus.DISMISSED, actor);
    }
}
