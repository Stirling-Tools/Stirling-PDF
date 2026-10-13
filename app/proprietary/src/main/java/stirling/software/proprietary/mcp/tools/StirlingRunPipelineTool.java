package stirling.software.proprietary.mcp.tools;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpAutomations;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Runs several operations on one input in a single call, or a saved automation's steps. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingRunPipelineTool implements McpTool {

    private final ObjectMapper mapper;
    private final McpAutomations automations;
    private final ObjectProvider<McpOperationExecutor> executor;

    public StirlingRunPipelineTool(
            ObjectMapper mapper,
            McpAutomations automations,
            ObjectProvider<McpOperationExecutor> executor) {
        this.mapper = mapper;
        this.automations = automations;
        this.executor = executor;
    }

    @Override
    public String name() {
        return "stirling_run_pipeline";
    }

    @Override
    public String title() {
        return "Run several operations at once";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.PRODUCES_FILE_OPEN_WORLD;
    }

    @Override
    public boolean rendersWidget() {
        return true;
    }

    @Override
    public List<String> fileParams() {
        return List.of(McpInputFiles.ATTACHMENT_ARG);
    }

    @Override
    public boolean available() {
        return automations.enabled();
    }

    @Override
    public String description() {
        return "Run several Stirling operations on one file in order, each step's result feeding"
                + " the next, and return only the final file. Use it for multi-step requests"
                + " (e.g. repair, then OCR, then compress) instead of calling tools one by one, and"
                + " to try out a workflow before saving it as an automation. Pass 'steps', or"
                + " 'automationId' to run a saved automation from stirling_list_automations. A"
                + " step that makes several files (e.g. a split) passes each one on to the next"
                + " step, several input files (fileIds) each run through, and a merge step takes"
                + " them all; a step that returns a report must come last. With automationId it is"
                + " a test: its steps run on the file given here and the result comes back in"
                + " chat, never touching its sources or destinations. To run a saved automation"
                + " for real, use stirling_run_automation.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");
        McpInputFiles.stepsProperty(
                props,
                automations.maxSteps(),
                "Operations to run in order. Parameters are as listed in each category tool.");
        McpToolSupport.stringProperty(
                props, "automationId", "Run this saved automation's steps instead of 'steps'.");
        McpInputFiles.inputProperties(props);
        return schema;
    }

    private static boolean isFinished(ObjectNode result) {
        return !result.path("isError").asBoolean(false)
                && !result.has("resultType")
                && !"pending".equals(result.path("structuredContent").path("kind").asText());
    }

    private static void appendText(ObjectNode result, String suffix) {
        JsonNode first = result.path("content").path(0);
        if (first instanceof ObjectNode block && block.has("text")) {
            block.put("text", block.get("text").asText() + suffix);
        }
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!automations.enabled()) {
            return McpResponses.error(
                    mapper,
                    "Automations (Pipelines) are turned off on this server; run the operations"
                            + " one at a time.");
        }
        McpOperationExecutor runner = executor.getIfAvailable();
        if (runner == null) {
            return McpResponses.error(mapper, "MCP execution is not available.");
        }
        String automationId = McpToolSupport.textArg(arguments, "automationId");
        if (automationId != null && !McpAutomationTrigger.fileGiven(arguments)) {
            return McpResponses.error(
                    mapper,
                    "Give a file to test this automation on here, or run it for real (from its"
                            + " sources, into its destinations) with stirling_run_automation.");
        }
        try {
            List<McpPipelineStep> steps =
                    automationId != null
                            ? automations.stepsOf(context.stirlingUserId(), automationId)
                            : automations.parseSteps(
                                    arguments == null ? null : arguments.get("steps"), context);
            for (McpPipelineStep step : steps) {
                if (!context.hasScope(step.meta().requiredScope())) {
                    return McpResponses.error(
                            mapper,
                            step.meta().id()
                                    + " needs the '"
                                    + step.meta().requiredScope()
                                    + "' scope.");
                }
            }
            ObjectNode result = runner.executePipeline(steps, arguments, context);
            if (automationId != null && isFinished(result)) {
                List<String> destinations =
                        automations.wiring(context.stirlingUserId(), automationId).destinations();
                appendText(
                        result,
                        destinations.isEmpty()
                                ? " This was a test run here in chat."
                                : " This was a test: nothing was sent to "
                                        + String.join(", ", destinations)
                                        + ". To deliver it, run it with stirling_run_automation.");
            }
            if (automationId == null && isFinished(result)) {
                appendText(
                        result,
                        " If the user will do this again, offer to save these steps as an"
                                + " automation with stirling_save_automation.");
            }
            return result;
        } catch (McpAutomations.AutomationException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
    }
}
