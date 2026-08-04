package stirling.software.proprietary.failure;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * "Seen, and I own it." Moves {@code NEW} to {@code ACKNOWLEDGED} so the row stops counting as
 * unread while staying in the open list. Touches only the status, not the document, ledger or run.
 *
 * <p>Re-acknowledging is a no-op that keeps the original actor and timestamp, so the first person
 * to pick it up stays credited.
 */
@Component
@RequiredArgsConstructor
public class AcknowledgeAction implements FailureAction {

    private final FileRunEventStore store;

    @Override
    public FailureActionId id() {
        return FailureActionId.ACKNOWLEDGE;
    }

    @Override
    public FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor) {
        // Guarded on NEW so a racing acknowledger cannot re-stamp the row, and so re-acknowledging
        // returns the first actor's row rather than taking their credit.
        return store.applyStatusOnce(
                event.id(),
                event.teamId(),
                FileRunEventStatus.ACKNOWLEDGED,
                actor,
                List.of(FileRunEventStatus.NEW));
    }
}
