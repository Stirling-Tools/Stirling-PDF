package stirling.software.SPDF.model;

/**
 * Persisted to session.json inside each server watch folder.
 *
 * <ul>
 *   <li>{@code sessionId} — routes SSE notifications to the current browser tab.</li>
 *   <li>{@code folderId} — folder UUID (redundant but avoids directory traversal).</li>
 *   <li>{@code outputTtlHours} — delete output files older than this many hours; {@code null} = keep forever.</li>
 *   <li>{@code deleteOutputOnDownload} — if {@code true}, the frontend sends a DELETE after downloading an output file.</li>
 * </ul>
 */
public record SessionConfig(
        String sessionId,
        String folderId,
        Integer outputTtlHours,
        Boolean deleteOutputOnDownload) {

    /** Compact constructor — treat null booleans as false. */
    public SessionConfig {
        if (deleteOutputOnDownload == null) deleteOutputOnDownload = false;
    }

    /** Convenience accessor with a sensible default. */
    public boolean isDeleteOutputOnDownload() {
        return Boolean.TRUE.equals(deleteOutputOnDownload);
    }
}
