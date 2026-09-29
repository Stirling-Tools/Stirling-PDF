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

    /**
     * Cap on the files one report may name. Each one becomes a permanent incident and this endpoint
     * is open to any authenticated user, so without a bound a single call can flood a leader's
     * queue. 200 is several times the largest batch an editor session plausibly fails on, and the
     * most the review queue shows in one page, so a real report never meets it.
     *
     * <p>An oversized report is refused whole rather than trimmed: see {@link
     * FileRunEventController#report}.
     */
    static final int MAX_FILE_IDS = 200;

    public EditorFailureReport {
        fileIds = fileIds == null ? List.of() : List.copyOf(fileIds);
    }

    boolean hasOperation() {
        return operation != null && !operation.isBlank();
    }

    /**
     * Counted before the blank ids are dropped, because this bounds the request rather than the
     * rows it would produce.
     */
    boolean namesTooManyFiles() {
        return fileIds.size() > MAX_FILE_IDS;
    }
}
