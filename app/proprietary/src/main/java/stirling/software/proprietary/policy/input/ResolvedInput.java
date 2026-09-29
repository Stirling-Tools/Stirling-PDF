package stirling.software.proprietary.policy.input;

import java.util.function.Consumer;

import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * One unit of work from an {@link InputSource}: the files to run plus a completion callback invoked
 * with the run's success (e.g. a folder source routes the input to done/error). A source may return
 * several of these, one per file.
 *
 * @param fileIdentity stable reference to the document — the source's own identity for it, or null
 *     when the source has none. Name-shaped by design: a run displays the file it is processing by
 *     it, and the ledger resolves it when a claim is released.
 */
public record ResolvedInput(
        PolicyInputs inputs, String fileIdentity, Consumer<Boolean> onComplete) {

    public ResolvedInput {
        onComplete = onComplete == null ? success -> {} : onComplete;
    }

    /**
     * One document, referenced by the source's own identity for it. Stable across sweeps, which is
     * what lets the same broken file fold into one incident instead of opening a fresh one every
     * time the source re-lists it. Deliberately not hashed: the identity is name-shaped (a folder's
     * is the document's path), which is exactly what lets a live run be shown by the file it is
     * processing — and the run feed already carries the delivered outputs' real paths, so hashing
     * the input hid nothing.
     */
    public static ResolvedInput forFile(
            PolicyInputs inputs, String identity, Consumer<Boolean> onComplete) {
        return new ResolvedInput(inputs, identity, onComplete);
    }

    /** No document reference and no completion side effect. */
    public static ResolvedInput of(PolicyInputs inputs) {
        return new ResolvedInput(inputs, null, success -> {});
    }
}
