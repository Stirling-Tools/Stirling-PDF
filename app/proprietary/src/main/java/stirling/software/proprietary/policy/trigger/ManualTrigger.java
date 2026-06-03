package stirling.software.proprietary.policy.trigger;

import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.engine.PolicyEngine;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;

/**
 * Fires a run on demand, in response to a request (the {@code PolicyController} run endpoint, an
 * AI, or another automation). Unlike background triggers it has no lifecycle: it simply forwards to
 * the engine, demonstrating the trigger to engine wiring future triggers (folder, schedule) follow.
 */
@Service
@RequiredArgsConstructor
public class ManualTrigger implements PolicyTrigger {

    private final PolicyEngine policyEngine;

    @Override
    public String type() {
        return "manual";
    }

    /** Submit a pipeline immediately and return its run handle. */
    public PolicyRunHandle fire(
            PipelineDefinition definition, List<Resource> inputs, PolicyProgressListener listener) {
        return policyEngine.submit(definition, inputs, listener);
    }
}
