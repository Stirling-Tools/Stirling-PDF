package stirling.software.proprietary.mcp.tools;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.mcp.McpAutomations;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpJobs;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.model.PolicyRunView;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.crypto.ResourceUpload;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Runs a saved automation for real: from its sources, or on given files, into its destinations. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpAutomationTrigger {

    static final String CONFIRM_KEY = "stirling_confirm_trigger";
    private static final Duration WAIT = Duration.ofMinutes(5);
    // A sweep over a big inbox finishes in the background; only small ones are waited for.
    private static final int MAX_AWAITED_RUNS = 5;

    private final ObjectMapper mapper;
    private final McpAutomations automations;
    private final McpFiles files;
    private final ObjectProvider<McpFileUrlFetcher> fetcher;
    private final ObjectProvider<McpJobs> jobs;

    public McpAutomationTrigger(
            ObjectMapper mapper,
            McpAutomations automations,
            McpFiles files,
            ObjectProvider<McpFileUrlFetcher> fetcher,
            ObjectProvider<McpJobs> jobs) {
        this.mapper = mapper;
        this.automations = automations;
        this.files = files;
        this.fetcher = fetcher;
        this.jobs = jobs;
    }

    /** True when the call names a file to run on instead of the automation's sources. */
    static boolean fileGiven(JsonNode args) {
        JsonNode ids = args == null ? null : args.get("fileIds");
        return McpInputFiles.hasSingle(args) || (ids != null && ids.isArray() && !ids.isEmpty());
    }

    public ObjectNode run(String automationId, JsonNode args, McpCallContext context) {
        McpAutomations.Wiring wiring;
        try {
            wiring = automations.wiring(context.stirlingUserId(), automationId);
        } catch (McpAutomations.AutomationException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
        List<MultipartFile> inputs = new ArrayList<>();
        if (fileGiven(args)) {
            String problem = resolveInputs(args, context, inputs);
            if (problem != null) {
                return McpResponses.error(mapper, problem, McpResponses.Failure.INPUT_UNAVAILABLE);
            }
        } else if (wiring.sources().isEmpty()) {
            return McpResponses.error(
                    mapper,
                    "'"
                            + wiring.name()
                            + "' has no source to pull files from. Give it a file to run on, or"
                            + " add a source in Stirling PDF's Pipelines.");
        } else if (!wiring.canTrigger()) {
            return McpResponses.error(
                    mapper,
                    "Only an admin or team leader can run '"
                            + wiring.name()
                            + "' against its sources. Give it a file instead: the result still"
                            + " goes to its destination.",
                    McpResponses.Failure.INSUFFICIENT_SCOPE);
        }
        // Results land in real destinations, so the user confirms first: in a form when the
        // client can show one, otherwise in chat before the assistant calls again.
        JsonNode answer = context.inputResponse(CONFIRM_KEY);
        boolean confirmed = args != null && args.path("confirmed").asBoolean(false);
        if (answer == null && context.canElicitForm()) {
            return McpResponses.inputRequired(
                    mapper, CONFIRM_KEY, confirmForm(wiring, !inputs.isEmpty()));
        }
        if (answer == null && !confirmed) {
            return McpResponses.text(
                    mapper,
                    "Not run yet. "
                            + plan(wiring, !inputs.isEmpty())
                            + " Ask the user to confirm, then call again with confirmed: true.");
        }
        if (answer != null && !"accept".equals(answer.path("action").asText())) {
            return McpResponses.text(mapper, "Cancelled: '" + wiring.name() + "' was not run.");
        }
        Supplier<ObjectNode> work = () -> start(wiring, inputs, context);
        McpJobs runner = jobs.getIfAvailable();
        return runner == null
                ? work.get()
                : runner.run("automation", context.stirlingUserId(), work);
    }

    private String resolveInputs(JsonNode args, McpCallContext context, List<MultipartFile> out) {
        User user = files.user(context);
        List<McpInputFiles.Input> resolved = new ArrayList<>();
        if (McpInputFiles.hasSingle(args)) {
            resolved.add(
                    McpInputFiles.resolve(
                            args, files, user, fetcher.getIfAvailable(), "input.pdf"));
        }
        resolved.addAll(McpInputFiles.resolveList(args, files, user));
        for (McpInputFiles.Input input : resolved) {
            if (input.error() != null) {
                return input.error();
            }
            out.add(
                    new ResourceUpload(
                            new ByteArrayResource(input.bytes()),
                            input.name(),
                            McpZipParts.mimeFor(input.name()),
                            input.bytes().length));
        }
        return null;
    }

    private ObjectNode start(
            McpAutomations.Wiring wiring, List<MultipartFile> inputs, McpCallContext context) {
        McpAutomations.Started started;
        try {
            started = automations.trigger(context.stirlingUserId(), wiring.id(), inputs);
        } catch (McpAutomations.AutomationException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
        List<PolicyRunView> views =
                started.runIds().size() <= MAX_AWAITED_RUNS
                        ? automations.await(started.runIds(), WAIT)
                        : List.of();
        return summary(wiring, started, views, !inputs.isEmpty());
    }

    private ObjectNode summary(
            McpAutomations.Wiring wiring,
            McpAutomations.Started started,
            List<PolicyRunView> views,
            boolean onGivenFiles) {
        int completed = count(views, PolicyRunStatus.COMPLETED);
        int failed = count(views, PolicyRunStatus.FAILED) + count(views, PolicyRunStatus.CANCELLED);
        int running = started.runIds().size() - completed - failed;
        String error =
                views.stream()
                        .filter(v -> v != null && v.error() != null)
                        .map(PolicyRunView::error)
                        .findFirst()
                        .orElse(null);
        String from =
                onGivenFiles ? "the given file" : "its sources (" + list(wiring.sources()) + ")";
        String to =
                wiring.destinations().isEmpty()
                        ? "It has no destination, so results are not saved anywhere the user can"
                                + " open them; add a destination, or test it on a file with"
                                + " stirling_run_pipeline to get the result in chat."
                        : "Results go to " + list(wiring.destinations()) + ".";
        if (wiring.paused()) {
            to += " Its automatic trigger is paused; running it now still works.";
        }
        StringBuilder text = new StringBuilder();
        if (started.runIds().isEmpty()) {
            text.append("Ran '")
                    .append(wiring.name())
                    .append("' but nothing new was processed from ");
            text.append(from).append('.').append(emptySweep(started.sweep()));
        } else {
            text.append("Ran '")
                    .append(wiring.name())
                    .append("' for real on ")
                    .append(started.runIds().size())
                    .append(started.runIds().size() == 1 ? " file" : " files")
                    .append(" from ")
                    .append(from)
                    .append(": ")
                    .append(completed)
                    .append(" done, ")
                    .append(failed)
                    .append(" failed, ")
                    .append(running)
                    .append(" still running. ")
                    .append(to);
            if (running > 0) {
                text.append(" Check on them later with stirling_automation_runs.");
            }
            if (error != null) {
                text.append(" First error: ").append(error);
            }
        }
        String url = automations.pipelinesUrl(wiring.id());
        if (url != null) {
            text.append(" Pipelines page: ").append(url);
        }
        ObjectNode result =
                failed > 0 && completed == 0 && running == 0
                        ? McpResponses.error(mapper, text.toString())
                        : McpResponses.text(mapper, text.toString());
        ObjectNode card = result.putObject("structuredContent");
        card.put("kind", "automation");
        card.put("mode", "trigger");
        card.put("automationId", wiring.id());
        card.put("name", wiring.name());
        card.put("runsStarted", started.runIds().size());
        started.runIds().forEach(card.putArray("runIds")::add);
        card.put("completed", completed);
        card.put("failed", failed);
        card.put("running", running);
        ArrayNode sources = card.putArray("sources");
        wiring.sources().forEach(sources::add);
        ArrayNode destinations = card.putArray("destinations");
        wiring.destinations().forEach(destinations::add);
        if (error != null) {
            card.put("error", error);
        }
        if (url != null) {
            card.put("pipelinesUrl", url);
        }
        return result;
    }

    private static String emptySweep(SweepOutcome sweep) {
        if (sweep == null) {
            return "";
        }
        if (sweep.parked() > 0) {
            return " "
                    + sweep.parked()
                    + " file(s) are parked after earlier failures; retry them in Pipelines.";
        }
        if (sweep.inFlight() > 0) {
            return " " + sweep.inFlight() + " file(s) are already being processed.";
        }
        if (sweep.alreadyProcessed() > 0) {
            return " All " + sweep.alreadyProcessed() + " file(s) there were processed before.";
        }
        if (sweep.filesListed() == 0) {
            return " No files could be found there: it may be empty, paused or unreachable."
                    + " Check the connection in Stirling PDF's Pipelines.";
        }
        return "";
    }

    private static int count(List<PolicyRunView> views, PolicyRunStatus status) {
        return (int) views.stream().filter(v -> v != null && v.status() == status).count();
    }

    private static String list(List<String> names) {
        return names.isEmpty() ? "none" : String.join(", ", names);
    }

    /** What running it for real does, in words the user can say yes or no to. */
    private static String plan(McpAutomations.Wiring wiring, boolean onGivenFiles) {
        StringBuilder plan =
                new StringBuilder("Running '")
                        .append(wiring.name())
                        .append("' for real processes ")
                        .append(
                                onGivenFiles
                                        ? "the given file"
                                        : "every new file in " + list(wiring.sources()));
        if (!onGivenFiles && !wiring.removesOriginalsFrom().isEmpty()) {
            plan.append(", removes each one from ")
                    .append(list(wiring.removesOriginalsFrom()))
                    .append(" after processing");
        }
        plan.append(", and delivers results to ")
                .append(
                        wiring.destinations().isEmpty()
                                ? "nowhere the user can open them (it has no destination)"
                                : list(wiring.destinations()))
                .append('.');
        return plan.toString();
    }

    private ObjectNode confirmForm(McpAutomations.Wiring wiring, boolean onGivenFiles) {
        ObjectNode params = mapper.createObjectNode();
        params.put("mode", "form");
        params.put("message", plan(wiring, onGivenFiles) + " Go ahead?");
        ObjectNode schema = params.putObject("requestedSchema");
        schema.put("type", "object");
        schema.putObject("properties");
        return params;
    }
}
