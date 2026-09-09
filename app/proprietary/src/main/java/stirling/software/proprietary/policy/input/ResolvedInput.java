package stirling.software.proprietary.policy.input;

import java.util.function.Consumer;

import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * One unit of work from an {@link InputSource}: the files to run plus a completion callback invoked
 * with the run's success (e.g. a folder source routes the input to done/error). A source may return
 * several of these, one per file.
 */
public record ResolvedInput(PolicyInputs inputs, Consumer<Boolean> onComplete) {

    public ResolvedInput {
        onComplete = onComplete == null ? success -> {} : onComplete;
    }

    /** No completion side effect. */
    public static ResolvedInput of(PolicyInputs inputs) {
        return new ResolvedInput(inputs, success -> {});
    }
}
