package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.util.List;

import stirling.software.proprietary.policy.model.InputSpec;

/**
 * Resolves a policy's {@link InputSpec} into the files to run on. The counterpart of {@code
 * PolicyOutputSink}: implementations are beans selected by {@link #supports(InputSpec)}, so a new
 * source kind (folder, S3) is just a new bean.
 *
 * <p>Used by time-based triggers (schedule) that must go fetch files; manual and event-driven
 * triggers supply files directly and bypass this.
 */
public interface InputSource {

    /** Stable identifier for this source, matching {@code InputSpec.type()} (e.g. "folder"). */
    String type();

    /** Whether this source can handle the given spec. */
    boolean supports(InputSpec spec);

    /**
     * Check that an input spec is usable, throwing {@link IllegalArgumentException} if not. Called
     * when a policy is saved so misconfiguration fails fast rather than at run time.
     */
    default void validate(InputSpec spec) {}

    /**
     * Resolve the spec into zero or more units of work, each carrying the files for one run and a
     * completion hook. Returning an empty list means there is nothing to run right now.
     */
    List<ResolvedInput> resolve(InputSpec spec) throws IOException;
}
