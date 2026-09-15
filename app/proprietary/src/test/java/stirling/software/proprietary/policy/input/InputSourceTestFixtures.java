package stirling.software.proprietary.policy.input;

import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.source.Source;

public final class InputSourceTestFixtures {

    private InputSourceTestFixtures() {}

    public static Source persistedSource(InputSpec spec) {
        return new Source("source-1", "Input", spec.type(), spec.options(), true, "alice", 1L);
    }
}
