package stirling.software.proprietary.policy.remote;

/** A resolved cloud folder a source reads or a destination writes. */
public interface CloudLocation {

    /** Snapshot mode: every run sees every file, nothing is claimed or removed. */
    boolean snapshot();

    /** A stable label for logs and caches, never including credentials. */
    String location();
}
