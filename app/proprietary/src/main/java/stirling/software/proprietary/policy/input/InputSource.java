package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

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

    default Map<String, Object> prepareOptionsForSave(
            Map<String, Object> options, boolean isCreate) {
        return options;
    }

    /**
     * Resolve the spec into zero or more units of work, each carrying one run's files and a
     * completion hook. Empty list means nothing to run right now. Discovery is read-only - files
     * stay where the user put them; "already processed" is tracked through {@code ctx} (claim on
     * pickup, settle on completion, report what is present so stale ledger rows can be pruned).
     */
    List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException;

    /**
     * Whether {@link #resolve} observes everything in the source (a complete listing) rather than
     * e.g. only what events surfaced. Presence cleanup of the ledger is skipped for the whole
     * policy unless every enabled source says true - wrongly pruning history would reprocess a
     * whole folder, while keeping a few stale rows costs nothing.
     */
    default boolean listsExhaustively() {
        return true;
    }

    /**
     * Filesystem dirs this source draws from, for the folder-watch trigger. Advisory: resolving is
     * still done by {@link #resolve}. Non-filesystem sources return empty and are not watchable.
     */
    default List<Path> watchTargets(InputSpec spec) {
        return List.of();
    }
}
