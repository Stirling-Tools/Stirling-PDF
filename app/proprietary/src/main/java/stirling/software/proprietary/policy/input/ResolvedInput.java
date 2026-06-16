package stirling.software.proprietary.policy.input;

import java.util.function.Consumer;

import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * One unit of work produced by an {@link InputSource}: the files to run plus a completion callback
 * invoked with the run's success once it finishes (e.g. a folder source routes the input to {@code
 * .stirling/done} or {@code .stirling/error}). A source may return several of these (e.g. one per
 * file).
 */
public record ResolvedInput(PolicyInputs inputs, Consumer<Boolean> onComplete) {

    public ResolvedInput {
        onComplete = onComplete == null ? success -> {} : onComplete;
    }

    /** A unit of work with no completion side effect. */
    public static ResolvedInput of(PolicyInputs inputs) {
        return new ResolvedInput(inputs, success -> {});
    }
}
