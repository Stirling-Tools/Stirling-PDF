package stirling.software.proprietary.policy.input;

import java.util.function.Consumer;

import stirling.software.proprietary.policy.ledger.IdentityHasher;
import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * One unit of work from an {@link InputSource}: the files to run plus a completion callback invoked
 * with the run's success (e.g. a folder source routes the input to done/error). A source may return
 * several of these, one per file.
 *
 * @param fileIdentity stable opaque reference to the document, or null when the source has none.
 *     Always hashed, never the source's own identity: a folder identity is a path, and a path is a
 *     filename. See {@link #forFile}.
 */
public record ResolvedInput(
        PolicyInputs inputs, String fileIdentity, Consumer<Boolean> onComplete) {

    public ResolvedInput {
        onComplete = onComplete == null ? success -> {} : onComplete;
    }

    /**
     * One document, referenced by the hash of the source's identity for it. Stable across sweeps,
     * which is what lets the same broken file fold into one incident instead of opening a fresh one
     * every time the source re-lists it.
     */
    public static ResolvedInput forFile(
            PolicyInputs inputs, String identity, Consumer<Boolean> onComplete) {
        return new ResolvedInput(
                inputs,
                identity == null ? null : IdentityHasher.identityHash(identity),
                onComplete);
    }

    /** No document reference and no completion side effect. */
    public static ResolvedInput of(PolicyInputs inputs) {
        return new ResolvedInput(inputs, null, success -> {});
    }
}
