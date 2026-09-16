package stirling.software.proprietary.policy.input;

/**
 * Marks an input {@link org.springframework.core.io.Resource} as backed by a row in app storage, so
 * an output sink writing back to storage (a new version of the input) can find the origin file.
 */
public interface StoredFileBacked {

    Long storedFileId();

    /**
     * The content revision a conditional write must still find on the row: the one captured at
     * discovery, or the one this run last committed. Anything else is a concurrent user upload.
     */
    long storedFileVersion();

    /**
     * Record a replacement this run committed, never a later user upload. Passing the stored
     * result's own revision keeps a second in-place write in the same run from failing its
     * conditional check against the superseded one.
     */
    void recordReplacement(String gate, String contentHash, long committedVersion);
}
