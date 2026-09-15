package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.source.Source;

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
     * Resolve a persisted source on behalf of its policy owner, including on background threads
     * without request authentication. Both identities must come from server-owned records, never
     * input options. Sources backed by private user storage must scope their reads to that owner;
     * sources over a connection shared by a policy's whole team say why they need not.
     *
     * <p>Each unit carries one run's files and a completion hook; an empty list means no work.
     * Discovery leaves files in place. Implementations track processing through {@code ctx}: claim
     * on pickup, settle on completion, and report presence for stale-ledger cleanup.
     */
    List<ResolvedInput> resolve(Source source, ResolveContext ctx, String policyOwner)
            throws IOException;

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
