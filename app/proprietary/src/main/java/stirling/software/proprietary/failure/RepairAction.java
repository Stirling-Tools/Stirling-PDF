package stirling.software.proprietary.failure;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * The server's half of {@link FailureActionId#REPAIR}: repair the document in place, then re-run.
 * Reached only for a smart folder's document; a reader holding the file repairs it client-side.
 */
@Component
@RequiredArgsConstructor
public class RepairAction implements FailureAction {

    private static final String REPAIR_ENDPOINT = "/api/v1/misc/repair";

    private final FolderDocumentFix fix;

    @Override
    public FailureActionId id() {
        return FailureActionId.REPAIR;
    }

    @Override
    public FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor) {
        return fix.fixAndRerun(
                event,
                actor,
                REPAIR_ENDPOINT,
                Map.of(),
                "This document is damaged beyond what the repair tools can fix.");
    }
}
