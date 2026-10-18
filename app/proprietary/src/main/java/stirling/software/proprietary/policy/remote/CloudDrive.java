package stirling.software.proprietary.policy.remote;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * One cloud storage provider, as the policy engine needs it: resolve a location from a source's
 * options, list it, read, conditionally remove, and upload without overwriting. {@link
 * CloudDriveInputSource} and {@code CloudDriveOutputSink} implement the ledger rules (claiming,
 * consensus removal, recording outputs before they are visible) once on top of this, so adding a
 * provider is an adapter, a config and a resolver.
 *
 * <p>Contract every adapter must meet, pinned by {@code CloudDriveContract} in the tests: a missing
 * folder is an error rather than an empty listing; {@link #remove} never removes a version other
 * than the one passed; {@link #upload} never replaces an existing name; and an uploaded file lists
 * with the identity {@link #outputIdentity} predicted and the gate {@link #newHasher} computed.
 */
public interface CloudDrive<L extends CloudLocation, F extends CloudFile> {

    /** The source and destination {@code type}s this drive serves; the first is its own. */
    Set<String> types();

    /**
     * The location the options describe, after credential and access checks.
     *
     * @throws IllegalArgumentException when the options are invalid or not permitted
     */
    L resolve(String type, Map<String, Object> options);

    /** Fails when the location cannot be listed, for save-time validation of a source. */
    void checkReadable(L location) throws IOException;

    /** Fails when the location's folder cannot be found, for save-time validation of a sink. */
    void checkWritable(L location) throws IOException;

    List<F> list(L location) throws IOException;

    /** The file's current state, or empty when it is gone. */
    Optional<F> stat(L location, F file) throws IOException;

    InputStream open(L location, F file) throws IOException;

    /**
     * Removes the file (or moves it to the provider's bin) only while it is still at {@code
     * file.version()}. Returns false when it changed; a file already gone counts as removed.
     */
    boolean remove(L location, F file) throws IOException;

    /** The identity a file named {@code name} will have once uploaded to the location. */
    String outputIdentity(L location, String name) throws IOException;

    ContentHasher newHasher();

    /** Uploads as {@code name}; empty when that name is taken, so the caller can pick another. */
    Optional<F> upload(L location, String name, Path content) throws IOException;

    /** A short provider name for log lines. */
    String label();
}
