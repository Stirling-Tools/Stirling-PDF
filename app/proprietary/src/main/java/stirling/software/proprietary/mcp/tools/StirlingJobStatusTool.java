package stirling.software.proprietary.mcp.tools;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpJobs;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Polls an operation that outlived the tool-call wait (see {@code mcp.syncWaitSeconds}). */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingJobStatusTool implements McpTool {

    private final ObjectMapper mapper;
    private final McpJobs jobs;

    public StirlingJobStatusTool(ObjectMapper mapper, McpJobs jobs) {
        this.mapper = mapper;
        this.jobs = jobs;
    }

    @Override
    public String name() {
        return "stirling_job_status";
    }

    @Override
    public String title() {
        return "Check a running operation";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.READ_ONLY;
    }

    @Override
    public boolean rendersWidget() {
        return true;
    }

    @Override
    public String description() {
        return "Get the result of a Stirling operation that was still running when it returned a"
                + " jobId. Returns the finished file, or says it is still running (wait about 30"
                + " seconds and call again).";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        McpToolSupport.stringProperty(
                schema.putObject("properties"), "jobId", "The jobId from the earlier result.");
        schema.putArray("required").add("jobId");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        return jobs.status(McpToolSupport.textArg(arguments, "jobId"), context.stirlingUserId());
    }
}
