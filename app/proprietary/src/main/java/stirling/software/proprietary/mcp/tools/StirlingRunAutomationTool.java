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

/** Runs a saved automation for real; marked destructive so hosts ask before it runs. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingRunAutomationTool implements McpTool {

    // It can delete source files and write to folders or buckets.
    private static final McpToolAnnotations REAL_RUN =
            new McpToolAnnotations(false, true, false, true);

    private final ObjectMapper mapper;
    private final McpAutomations automations;
    private final ObjectProvider<McpAutomationTrigger> trigger;

    public StirlingRunAutomationTool(
            ObjectMapper mapper,
            McpAutomations automations,
            ObjectProvider<McpAutomationTrigger> trigger) {
        this.mapper = mapper;
        this.automations = automations;
        this.trigger = trigger;
    }

    @Override
    public String name() {
        return "stirling_run_automation";
    }

    @Override
    public String title() {
        return "Run a saved automation for real";
    }

    @Override
    public McpToolAnnotations annotations() {
        return REAL_RUN;
    }

    @Override
    public boolean rendersWidget() {
        return true;
    }

    @Override
    public boolean available() {
        return automations.enabled();
    }

    @Override
    public List<String> fileParams() {
        return List.of(McpInputFiles.ATTACHMENT_ARG);
    }

    @Override
    public String description() {
        return "Run a saved automation for real, as if its trigger fired: it pulls new files from"
                + " its sources (or uses a file given here instead) and delivers results to its"
                + " destinations. Use it when the user asks to run, process or kick off an"
                + " automation (e.g. 'process my inbox'); to try one on a file and see the result"
                + " in chat, use stirling_run_pipeline. Before running, tell the user where files"
                + " come from, whether they are removed from there afterwards, and where results"
                + " go, and only run once they agree. Running against sources needs an admin or"
                + " team leader; anyone may run it on a file they give.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");
        McpToolSupport.stringProperty(
                props, "automationId", "The automation to run, from stirling_list_automations.");
        ObjectNode confirmed = props.putObject("confirmed");
        confirmed.put("type", "boolean");
        confirmed.put(
                "description",
                "Set true only after the user agreed to run it for real in this chat.");
        McpInputFiles.inputProperties(props);
        schema.putArray("required").add("automationId");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        McpAutomationTrigger runner = trigger.getIfAvailable();
        if (!automations.enabled() || runner == null) {
            return McpResponses.error(
                    mapper, "Automations (Pipelines) are turned off on this server.");
        }
        if (!context.hasScope("mcp.tools.write")) {
            return McpResponses.error(
                    mapper,
                    "Running an automation for real needs the 'mcp.tools.write' scope.",
                    McpResponses.Failure.INSUFFICIENT_SCOPE);
        }
        String automationId = McpToolSupport.textArg(arguments, "automationId");
        if (automationId == null) {
            return McpResponses.error(
                    mapper, "Pass 'automationId' (from stirling_list_automations).");
        }
        return runner.run(automationId, arguments, context);
    }
}
