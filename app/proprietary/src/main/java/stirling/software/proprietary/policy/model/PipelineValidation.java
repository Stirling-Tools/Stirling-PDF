package stirling.software.proprietary.policy.model;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.common.model.tool.ToolFormat;

/**
 * Checking whether a policy's steps can run on each other, without the files they would run on.
 *
 * <p>The same check runs at save time in {@code PolicyValidator}. This exposes it on its own so a
 * chain can be checked before it is saved, and so callers that are not the editor can ask.
 */
public final class PipelineValidation {

    private PipelineValidation() {}

    /**
     * @param steps the steps to check, in the order they would run
     * @param sourceFormat the format of the files entering the first step, or null to check only
     *     that the steps fit together
     */
    @Schema(description = "A chain of steps to check")
    public record Request(List<PipelineStep> steps, ToolFormat sourceFormat) {

        public List<PipelineStep> steps() {
            return steps == null ? List.of() : steps;
        }
    }

    /**
     * @param valid false when at least one diagnostic is an error, meaning the chain cannot run
     * @param diagnostics every problem found, each against the step that cannot run
     */
    @Schema(description = "Whether a chain of steps can run, and what is wrong with it if not")
    public record Response(boolean valid, List<ToolDiagnostic> diagnostics) {}
}
