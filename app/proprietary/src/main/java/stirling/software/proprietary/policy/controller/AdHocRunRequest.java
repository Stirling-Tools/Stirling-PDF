package stirling.software.proprietary.policy.controller;

import java.util.List;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;

/** The pipeline an ad-hoc run executes, as a client may state it. */
public record AdHocRunRequest(String name, List<PipelineStep> steps, List<OutputSpec> outputs) {

    PipelineDefinition toDefinition() {
        return new PipelineDefinition(name, steps, outputs);
    }
}
