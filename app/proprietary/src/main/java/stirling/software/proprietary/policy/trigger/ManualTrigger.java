package stirling.software.proprietary.policy.trigger;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.engine.PolicyEngine;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;

/**
 * Runs policies on demand, in response to a request (the {@code PolicyController} endpoints, an AI,
 * or another automation). It is the request-driven trigger: no background lifecycle, it just
 * forwards to the engine. Any policy can be run manually regardless of its configured trigger type.
 */
@Service
@RequiredArgsConstructor
public class ManualTrigger implements PolicyTrigger {

    private final PolicyEngine policyEngine;

    @Override
    public String type() {
        return "manual";
    }

    /** Run a stored policy immediately and return its run handle. */
    public PolicyRunHandle run(
            Policy policy, PolicyInputs inputs, PolicyProgressListener listener) {
        return policyEngine.runPolicy(policy, inputs, listener);
    }

    /** Run an ad-hoc pipeline (no stored policy), e.g. for AI or Automate one-offs. */
    public PolicyRunHandle fire(
            PipelineDefinition definition, PolicyInputs inputs, PolicyProgressListener listener) {
        return policyEngine.submit(definition, inputs, listener);
    }
}
