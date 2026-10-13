package stirling.software.proprietary.mcp.tools;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.mcp.McpAutomations;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.policy.model.PolicyRunView;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Recent automation runs and why any failed, so "did last night's run work?" has an answer. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingAutomationRunsTool implements McpTool {

    private static final DateTimeFormatter WHEN =
            DateTimeFormatter.ofPattern("d MMM HH:mm 'UTC'", Locale.ENGLISH)
                    .withZone(ZoneOffset.UTC);

    private final ObjectMapper mapper;
    private final McpAutomations automations;

    public StirlingAutomationRunsTool(ObjectMapper mapper, McpAutomations automations) {
        this.mapper = mapper;
        this.automations = automations;
    }

    @Override
    public String name() {
        return "stirling_automation_runs";
    }

    @Override
    public String title() {
        return "Check automation runs";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.READ_ONLY;
    }

    @Override
    public boolean available() {
        return automations.enabled();
    }

    @Override
    public String description() {
        return "Recent runs of the team's automations, newest first: when each ran, on which"
                + " file, whether it finished, failed or is still running, why it failed, and"
                + " what it produced. Pass automationId for one automation, or runIds from an"
                + " earlier run to follow up on runs still in progress. Shows runs on files and"
                + " sources this user owns.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");
        McpToolSupport.stringProperty(
                props,
                "automationId",
                "Only this automation's runs (from stirling_list_automations).");
        ObjectNode runIds = props.putObject("runIds");
        runIds.put("type", "array");
        runIds.put("description", "Specific runs to check, as returned when an automation ran.");
        runIds.putObject("items").put("type", "string");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.read")) {
            return McpResponses.error(
                    mapper,
                    "Checking runs requires 'mcp.tools.read'.",
                    McpResponses.Failure.INSUFFICIENT_SCOPE);
        }
        List<String> runIds = new ArrayList<>();
        JsonNode ids = arguments == null ? null : arguments.get("runIds");
        if (ids != null && ids.isArray()) {
            ids.forEach(id -> runIds.add(id.asText()));
        }
        try {
            List<PolicyRunView> runs =
                    automations.runs(
                            context.stirlingUserId(),
                            McpToolSupport.textArg(arguments, "automationId"),
                            runIds);
            StringBuilder text =
                    new StringBuilder(runs.isEmpty() ? "No runs found." : "Recent runs:");
            ObjectNode structured = mapper.createObjectNode();
            structured.put("kind", "runs");
            ArrayNode list = structured.putArray("runs");
            for (PolicyRunView run : runs) {
                text.append("\n- ").append(describe(run));
                ObjectNode item =
                        list.addObject()
                                .put("runId", run.runId())
                                .put("automationId", run.policyId())
                                .put("status", run.status().name().toLowerCase(Locale.ROOT))
                                .put("startedAt", Instant.ofEpochMilli(run.createdAt()).toString());
                if (run.fileName() != null) {
                    item.put("fileName", run.fileName());
                }
                if (run.error() != null) {
                    item.put("error", run.error());
                }
                ArrayNode outputs = item.putArray("outputs");
                if (run.outputs() != null) {
                    run.outputs().forEach(o -> outputs.add(o.getFileName()));
                }
            }
            ObjectNode result = McpResponses.text(mapper, text.toString());
            result.set("structuredContent", structured);
            return result;
        } catch (McpAutomations.AutomationException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
    }

    /** E.g. "invoice.pdf: failed at step 2 of 3 (6 Oct 09:00 UTC): OCR found existing text". */
    static String describe(PolicyRunView run) {
        StringBuilder line =
                new StringBuilder(
                                run.fileName() != null
                                        ? run.fileName()
                                        : "Run " + shortId(run.runId()))
                        .append(": ");
        switch (run.status()) {
            case COMPLETED -> line.append("finished");
            case FAILED -> line.append("failed at step ").append(stepOf(run));
            case CANCELLED -> line.append("cancelled");
            case WAITING_FOR_INPUT -> line.append("waiting for input");
            default -> line.append("still running (step ").append(stepOf(run)).append(')');
        }
        line.append(" (").append(WHEN.format(Instant.ofEpochMilli(run.createdAt()))).append(')');
        if (run.error() != null) {
            line.append(": ").append(run.error());
        }
        List<ResultFile> outputs = run.outputs();
        if (outputs != null && !outputs.isEmpty()) {
            line.append(run.externalOutput() ? "; delivered " : "; produced ")
                    .append(
                            String.join(
                                    ", ", outputs.stream().map(ResultFile::getFileName).toList()));
        }
        return line.toString();
    }

    // Run ids are "owner:uuid"; the first part of the uuid is enough to tell runs apart.
    private static String shortId(String runId) {
        String id = runId == null ? "" : runId.substring(runId.lastIndexOf(':') + 1);
        return id.length() > 8 ? id.substring(0, 8) : id;
    }

    private static String stepOf(PolicyRunView run) {
        // currentStep is one-based; 0 means it has not started a step yet.
        return Math.max(1, run.currentStep()) + " of " + run.stepCount();
    }
}
