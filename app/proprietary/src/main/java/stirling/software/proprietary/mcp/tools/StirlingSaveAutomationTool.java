package stirling.software.proprietary.mcp.tools;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpAutomations;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Saves a step list as a team automation, shown in Stirling PDF's Pipelines. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingSaveAutomationTool implements McpTool {

    private static final int MAX_NAME = 100;

    private final ObjectMapper mapper;
    private final McpAutomations automations;

    public StirlingSaveAutomationTool(ObjectMapper mapper, McpAutomations automations) {
        this.mapper = mapper;
        this.automations = automations;
    }

    @Override
    public String name() {
        return "stirling_save_automation";
    }

    @Override
    public String title() {
        return "Save an automation";
    }

    @Override
    public McpToolAnnotations annotations() {
        return new McpToolAnnotations(false, false, false, false);
    }

    @Override
    public boolean available() {
        return automations.enabled();
    }

    @Override
    public String description() {
        return "Create or update an automation (a Stirling PDF pipeline) for the user's team: its"
                + " steps, and optionally a source plus trigger so it runs by itself (on a"
                + " schedule, when files land in a watched folder, from a webhook, or on every"
                + " upload or export in the Stirling PDF editor) and a destination for the"
                + " results. Get source and destination ids, and each existing automation's steps"
                + " and settings, from stirling_list_automations. Tell the user the plan first:"
                + " where files come from, whether the source removes them after processing, when"
                + " it runs, and where results go. Saving needs a Stirling admin or team leader;"
                + " anyone can try steps with stirling_run_pipeline. Deleting is done in Stirling"
                + " PDF's Pipelines page.";
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
                "Update this existing automation instead of creating one; omitted fields keep"
                        + " their current values.");
        McpToolSupport.stringProperty(
                props,
                "name",
                "A short name, e.g. 'Prepare for email'. Required when creating; omit when"
                        + " updating to keep the current name.");
        McpInputFiles.stepsProperty(
                props,
                automations.maxSteps(),
                "Operations to run in order, as for stirling_run_pipeline. Replaces all of an"
                        + " existing automation's steps: to change one, copy the others with their"
                        + " parameters from stirling_list_automations. Steps that need an extra"
                        + " file (stamp or watermark image, certificate, overlay) can't be saved"
                        + " from chat yet.");
        McpToolSupport.stringProperty(
                props,
                "sourceId",
                "Where files come from, so it runs by itself: a source id from"
                        + " stirling_list_automations, or 'editor' to run on every PDF uploaded"
                        + " to or exported from the Stirling PDF editor ('' removes it).");
        ObjectNode trigger = props.putObject("trigger");
        trigger.put("type", "object");
        trigger.put(
                "description",
                "When it runs by itself; omit to keep the current trigger (null removes it, so it"
                        + " runs only on demand). Schedule example: {\"type\":\"schedule\","
                        + "\"options\":{\"schedule\":{\"type\":\"weekly\",\"days\":"
                        + "[\"MONDAY\"],\"at\":\"09:00\"},\"zone\":\"Europe/London\"}}."
                        + " Schedules: every {count, unit MINUTES|HOURS|DAYS}, daily {at},"
                        + " weekly {days, at}, monthly {dayOfMonth, at}; 'at' is 24-hour HH:mm,"
                        + " 'zone' an IANA id (default UTC), days 29-31 skip shorter months, and"
                        + " the first run follows the schedule rather than happening at once."
                        + " folder-watch and webhook need a matching sourceId and no options;"
                        + " upload and export need sourceId 'editor'.");
        ObjectNode triggerProps = trigger.putObject("properties");
        ObjectNode triggerType = triggerProps.putObject("type");
        triggerType.put("type", "string");
        triggerType
                .putArray("enum")
                .add("schedule")
                .add("folder-watch")
                .add("webhook")
                .add("upload")
                .add("export");
        triggerProps.putObject("options").put("type", "object");
        trigger.putArray("required").add("type");
        McpToolSupport.stringProperty(
                props,
                "destinationId",
                "Where results go: a connection from stirling_list_automations that can be a"
                        + " destination. Needed for automations that run by themselves, or their"
                        + " results are not delivered anywhere ('' removes it).");
        ObjectNode enabled = props.putObject("enabled");
        enabled.put("type", "boolean");
        enabled.put(
                "description",
                "false pauses it: its trigger stops firing (running it on demand still works)."
                        + " Default true.");
        return schema;
    }

    /** The argument as given, keeping "" (which clears a field) apart from absent. */
    private static String rawText(JsonNode arguments, String field) {
        JsonNode node = arguments == null ? null : arguments.get(field);
        return node != null && node.isTextual() ? node.asText().trim() : null;
    }

    /** Settings checked before saving, so a typo fails here rather than on every later run. */
    private static String savableProblem(List<McpPipelineStep> steps) {
        for (int i = 0; i < steps.size(); i++) {
            McpPipelineStep step = steps.get(i);
            String label = "Step " + (i + 1) + " (" + step.meta().id() + ")";
            for (String field : McpFileParameters.fileFields(step.meta().paramSchema())) {
                JsonNode value = step.parameters() == null ? null : step.parameters().get(field);
                if (value != null && !value.isNull()) {
                    return label
                            + " uses an extra file ('"
                            + field
                            + "'), which automations saved from chat can't keep yet. Set that"
                            + " step up in Stirling PDF's Pipelines, or run it now with"
                            + " stirling_run_pipeline.";
                }
            }
            List<String> problems =
                    McpParameterCheck.problems(step.meta().paramSchema(), step.parameters());
            if (!problems.isEmpty()) {
                return label
                        + ": "
                        + String.join("; ", problems)
                        + ". Fix the parameters ("
                        + McpOperationSignature.of(step.meta().paramSchema())
                        + ") and save again.";
            }
        }
        return null;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.write")) {
            return McpResponses.error(
                    mapper,
                    "Saving automations requires 'mcp.tools.write'.",
                    McpResponses.Failure.INSUFFICIENT_SCOPE);
        }
        String automationId = McpToolSupport.textArg(arguments, "automationId");
        String name = McpToolSupport.textArg(arguments, "name");
        if (automationId == null && (name == null || name.isBlank())) {
            return McpResponses.error(mapper, "Pass a 'name' for the automation.");
        }
        if (name != null) {
            name =
                    name.trim().length() > MAX_NAME
                            ? name.trim().substring(0, MAX_NAME)
                            : name.trim();
        }
        try {
            JsonNode stepsNode = arguments.get("steps");
            List<McpPipelineStep> steps =
                    stepsNode == null && automationId != null
                            ? null
                            : automations.parseSteps(stepsNode, context);
            String stepProblem = steps == null ? null : savableProblem(steps);
            if (stepProblem != null) {
                return McpResponses.error(
                        mapper, stepProblem, McpResponses.Failure.INVALID_PARAMETERS);
            }
            JsonNode enabledNode = arguments.get("enabled");
            McpAutomations.Saved saved =
                    automations.save(
                            context.stirlingUserId(),
                            new McpAutomations.Draft(
                                    automationId,
                                    name,
                                    steps,
                                    rawText(arguments, "sourceId"),
                                    arguments.get("trigger"),
                                    rawText(arguments, "destinationId"),
                                    enabledNode != null && enabledNode.isBoolean()
                                            ? enabledNode.asBoolean()
                                            : null));
            String id = saved.id();
            String label = saved.name() != null ? saved.name() : id;
            String url = automations.pipelinesUrl(id);
            StringBuilder text =
                    new StringBuilder("Saved automation '")
                            .append(label)
                            .append("' (automationId=")
                            .append(id)
                            .append("). ")
                            .append(saved.active() ? "Active" : "Paused")
                            .append("; runs ")
                            .append(saved.runs())
                            .append("; results to ")
                            .append(
                                    saved.destinations().isEmpty()
                                            ? "no destination"
                                            : String.join(", ", saved.destinations()))
                            .append('.');
            saved.notes().forEach(note -> text.append(' ').append(note));
            if (url != null) {
                text.append(" The user can see it in Stirling PDF's Pipelines: ").append(url);
            }
            ObjectNode result = McpResponses.text(mapper, text.toString());
            ObjectNode structured =
                    result.putObject("structuredContent")
                            .put("automationId", id)
                            .put("name", label)
                            .put("status", saved.active() ? "active" : "paused")
                            .put("runs", saved.runs());
            saved.destinations().forEach(structured.putArray("destinations")::add);
            saved.notes().forEach(structured.putArray("notes")::add);
            if (url != null) {
                structured.put("pipelinesUrl", url);
            }
            return result;
        } catch (McpAutomations.AutomationException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
    }
}
