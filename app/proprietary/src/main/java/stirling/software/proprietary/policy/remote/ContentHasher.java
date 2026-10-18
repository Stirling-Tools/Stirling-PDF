package stirling.software.proprietary.policy.remote;

/**
 * Digests an output while it is staged, producing the ledger gate the drive will report for that
 * content once uploaded. Not thread-safe; one per file.
 */
public interface ContentHasher {

    void update(byte[] bytes, int offset, int length);

    String gate();
}
