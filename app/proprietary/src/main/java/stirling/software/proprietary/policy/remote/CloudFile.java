package stirling.software.proprietary.policy.remote;

/**
 * One file a {@link CloudDrive} listed. {@code identity} keys the file's ledger row and must be
 * derivable before the file exists (the drive's {@link CloudDrive#outputIdentity}), so an output
 * can be recorded ahead of its upload. {@code version} is the ledger gate: a content hash where the
 * drive reports one, otherwise a change tag.
 */
public interface CloudFile {

    String identity();

    String version();

    String name();

    long size();

    /** Whether {@link #version()} is a content hash rather than a change tag. */
    boolean hasContentHash();
}
