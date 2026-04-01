package stirling.software.SPDF.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Persisted to session.json inside each server watch folder.
 *
 * <ul>
 *   <li>{@code sessionId} — routes SSE notifications to the current browser tab.
 *   <li>{@code folderId} — folder UUID (redundant but avoids directory traversal).
 *   <li>{@code outputTtlHours} — delete output files older than this many hours; {@code null} =
 *       keep forever.
 *   <li>{@code deleteOutputOnDownload} — if {@code true}, the frontend sends a DELETE after
 *       downloading an output file.
 * </ul>
 */
public record SessionConfig(
        @JsonProperty("sessionId") String sessionId,
        @JsonProperty("folderId") String folderId,
        @JsonProperty("outputTtlHours") Integer outputTtlHours,
        @JsonProperty("deleteOutputOnDownload") Boolean deleteOutputOnDownload) {

    @JsonCreator
    public SessionConfig(
            @JsonProperty("sessionId") String sessionId,
            @JsonProperty("folderId") String folderId,
            @JsonProperty("outputTtlHours") Integer outputTtlHours,
            @JsonProperty("deleteOutputOnDownload") Boolean deleteOutputOnDownload) {
        this.sessionId = sessionId;
        this.folderId = folderId;
        this.outputTtlHours = outputTtlHours;
        this.deleteOutputOnDownload =
                deleteOutputOnDownload == null ? false : deleteOutputOnDownload;
    }

    /** Convenience accessor with a sensible default. */
    public boolean isDeleteOutputOnDownload() {
        return Boolean.TRUE.equals(deleteOutputOnDownload);
    }
}
