package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

import stirling.software.proprietary.policy.model.InputSpec;

/**
 * Resolves a policy {@link InputSpec} into the files to run on. Implementations are beans selected
 * by {@link #supports(InputSpec)}, so a new source kind (folder, S3) is just a new bean. A manual
 * run may supply files directly and bypass sources entirely.
 */
public interface InputSource {

    /** Stable identifier for this source, matching {@code InputSpec.type()} (e.g. "folder"). */
    String type();

    /** Whether this source can handle the given spec. */
    boolean supports(InputSpec spec);

    /** Throws {@link IllegalArgumentException} on bad config. Called on save to fail fast. */
    default void validate(InputSpec spec) {}

    /**
     * Resolve the spec into zero or more units of work, each carrying one run's files and a
     * completion hook. Empty list means nothing to run right now.
     */
    List<ResolvedInput> resolve(InputSpec spec) throws IOException;

    /**
     * Filesystem dirs this source draws from, for the folder-watch trigger. Advisory: resolving is
     * still done by {@link #resolve}. Non-filesystem sources return empty and are not watchable.
     */
    default List<Path> watchTargets(InputSpec spec) {
        return List.of();
    }
}
