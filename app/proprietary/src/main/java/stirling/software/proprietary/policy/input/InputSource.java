package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.util.List;

import stirling.software.proprietary.policy.model.InputSpec;

/**
 * Resolves one of a policy's {@link InputSpec sources} into the files to run on - answering
 * <em>where</em> a run's files come from, independent of <em>when</em> it runs. The counterpart of
 * {@code PolicyOutputSink}: implementations are beans selected by {@link #supports(InputSpec)}, so
 * a new source kind (folder, S3) is just a new bean.
 *
 * <p>Driven by the {@code PolicyRunner}, which a trigger calls when a policy is due; a source is
 * passive and knows nothing about what triggered the run. A manual run may instead supply files
 * directly and bypass sources entirely.
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
