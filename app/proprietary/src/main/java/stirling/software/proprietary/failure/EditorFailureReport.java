package stirling.software.proprietary.failure;

import java.util.List;

/**
 * A failure a user hit in the editor, reported by their own client. The editor calls tools directly
 * rather than through the policy engine, so nothing server-side sees these unless the client says
 * so.
 *
 * <p>Note what the client cannot supply: no team, no actor, no document name. The first two come
 * from the authenticated session, and the third is never stored.
 *
 * @param operation the tool that failed, e.g. {@code remove-password}
 * @param errorCode the code from the tool's Problem Details response, or null when there was none
 * @param fileIds opaque client-side ids of the documents involved; empty when none is attributable
 * @param detail the message the user saw
 */
public record EditorFailureReport(
        String operation, String errorCode, List<String> fileIds, String detail) {

    public EditorFailureReport {
        fileIds = fileIds == null ? List.of() : List.copyOf(fileIds);
    }

    boolean hasOperation() {
        return operation != null && !operation.isBlank();
    }
}
