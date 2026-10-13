package stirling.software.proprietary.mcp.tools;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpAutomations;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.policy.trigger.TriggerInfo;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** The team's saved automations, so the assistant can run one by name. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingListAutomationsTool implements McpTool {

    private final ObjectMapper mapper;
    private final McpAutomations automations;

    public StirlingListAutomationsTool(ObjectMapper mapper, McpAutomations automations) {
        this.mapper = mapper;
        this.automations = automations;
    }

    @Override
    public String name() {
        return "stirling_list_automations";
    }

    @Override
    public String title() {
        return "List saved automations";
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
        return "List the team's automations (Stirling PDF pipelines): whether each is active or"
                + " paused, when it runs (schedule, watched folder, webhook, editor upload or"
                + " export, or on demand), its steps with their settings, and where results go."
                + " Also lists the team's connections (what each points at, whether it removes"
                + " files after processing, webhook URLs), the triggers available, and what this"
                + " user may do. Call it first whenever the user wants a repeatable or automatic"
                + " PDF workflow, or asks about an existing one.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        schema.putObject("properties");
        return schema;
    }

    /** E.g. "compress-pdf{optimizeLevel=4}"; a step with no settings is just its name. */
    private String step(McpAutomations.StepView step) {
        if (step.parameters() == null || step.parameters().isEmpty()) {
            return step.operation();
        }
        return step.operation() + mapper.writeValueAsString(step.parameters());
    }

    /** E.g. "Scans (server folder /data/scans, sourceId=x; removes files after processing)". */
    static String describe(McpAutomations.SourceRef source) {
        StringBuilder line = new StringBuilder(source.name()).append(" (").append(source.kind());
        if (source.location() != null) {
            line.append(' ').append(source.location());
        }
        line.append(", sourceId=").append(source.id());
        if (source.paused()) {
            line.append("; paused");
        }
        if (source.removesOriginals()) {
            line.append("; removes files after processing");
        }
        line.append(source.canBeDestination() ? "; can be a destination" : "; source only");
        if (source.webhookUrl() != null) {
            line.append("; webhook URL ").append(source.webhookUrl());
        }
        return line.append(')').toString();
    }

    private static String abilities(McpAutomations.Setup setup) {
        if (setup.canSave() && setup.canTrigger()) {
            return "This user can save automations and run them against their sources.";
        }
        if (setup.canTrigger()) {
            return "This user can run automations against their sources but not save them.";
        }
        return "This user can test automations and run them on a file they give; only an admin"
                + " or team leader can run them against their sources"
                + (setup.canSave() ? "." : " or save them.");
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.read")) {
            return McpResponses.error(
                    mapper,
                    "Listing automations requires 'mcp.tools.read'.",
                    McpResponses.Failure.INSUFFICIENT_SCOPE);
        }
        try {
            StringBuilder text = new StringBuilder();
            ObjectNode structured = mapper.createObjectNode();
            ArrayNode list = structured.putArray("automations");
            for (McpAutomations.Summary s : automations.list(context.stirlingUserId())) {
                ObjectNode item = list.addObject();
                item.put("automationId", s.id());
                item.put("name", s.name());
                item.put("status", s.active() ? "active" : "paused");
                item.put("runs", s.runs());
                ArrayNode steps = item.putArray("steps");
                s.steps()
                        .forEach(
                                step ->
                                        steps.addObject()
                                                .put("operation", step.operation())
                                                .set(
                                                        "parameters",
                                                        mapper.valueToTree(step.parameters())));
                item.put("testableInChat", s.runnable());
                s.sources().forEach(item.putArray("sources")::add);
                s.destinations().forEach(item.putArray("destinations")::add);
                text.append("\n- ")
                        .append(s.name())
                        .append(s.active() ? "" : " [paused]")
                        .append(" (automationId=")
                        .append(s.id())
                        .append("): ")
                        .append(String.join(" > ", s.steps().stream().map(this::step).toList()))
                        .append(" | runs ")
                        .append(s.runs())
                        .append(" | results to ")
                        .append(
                                s.destinations().isEmpty()
                                        ? "no destination"
                                        : String.join(", ", s.destinations()));
                if (s.problem() != null) {
                    item.put("problem", s.problem());
                    text.append(" [can't be tested on a chat file: ")
                            .append(s.problem())
                            .append("; running it for real still works]");
                }
            }
            McpAutomations.Setup setup = automations.setup(context.stirlingUserId());
            ArrayNode sources = structured.putArray("sources");
            StringBuilder setupText = new StringBuilder();
            for (McpAutomations.SourceRef source : setup.sources()) {
                ObjectNode item =
                        sources.addObject()
                                .put("sourceId", source.id())
                                .put("name", source.name())
                                .put("type", source.type())
                                .put("paused", source.paused())
                                .put("removesOriginals", source.removesOriginals())
                                .put("canBeDestination", source.canBeDestination());
                if (source.location() != null) {
                    item.put("location", source.location());
                }
                if (source.webhookUrl() != null) {
                    item.put("webhookUrl", source.webhookUrl());
                }
                setupText.append("\n- ").append(describe(source));
            }
            boolean connected = !setup.sources().isEmpty();
            ArrayNode triggers = structured.putArray("triggers");
            for (TriggerInfo trigger : setup.triggers()) {
                ObjectNode t = triggers.addObject().put("type", trigger.type());
                trigger.supportedSourceTypes().forEach(t.putArray("sourceTypes")::add);
            }
            structured.put("canSave", setup.canSave());
            structured.put("canTrigger", setup.canTrigger());
            setup.sourceKinds().forEach(structured.putArray("sourceKinds")::add);
            setup.destinationKinds().forEach(structured.putArray("destinationKinds")::add);
            // Say plainly when only the built-in Editor exists, and what an admin could connect.
            String kinds =
                    "Connections can't be created from chat; an admin adds them in Stirling PDF's"
                            + " Pipelines. Sources can be: "
                            + String.join(", ", setup.sourceKinds())
                            + ". Destinations can be: "
                            + String.join(", ", setup.destinationKinds())
                            + ".";
            text.append(
                            connected
                                    ? "\nConnections:" + setupText + "\n" + kinds
                                    : "\nNo connections (folders, S3, SFTP and so on) are set up"
                                            + " yet. "
                                            + kinds)
                    .append("\nTriggers: ")
                    .append(
                            String.join(
                                    ", ",
                                    setup.triggers().stream().map(TriggerInfo::type).toList()))
                    .append(
                            "\nTo run an automation on every PDF the user uploads to (or exports"
                                    + " from) the Stirling PDF editor, save it with sourceId"
                                    + " 'editor' and trigger {\"type\":\"upload\"} or"
                                    + " {\"type\":\"export\"}; results go back into the editor.")
                    .append("\n")
                    .append(abilities(setup));
            String url = automations.pipelinesUrl(null);
            String where =
                    url == null ? "" : " Manage them in Stirling PDF's Pipelines page: " + url;
            ObjectNode result =
                    McpResponses.text(
                            mapper,
                            (list.isEmpty() ? "No saved automations yet." : "Saved automations:")
                                    + text
                                    + "\n"
                                    + where.trim());
            if (url != null) {
                structured.put("pipelinesUrl", url);
            }
            result.set("structuredContent", structured);
            return result;
        } catch (McpAutomations.AutomationException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
    }
}
