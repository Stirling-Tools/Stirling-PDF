package stirling.software.proprietary.mcp;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.JobStore;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationMeta;
import stirling.software.proprietary.mcp.tools.McpPipelineStep;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.controller.PolicyController;
import stirling.software.proprietary.policy.controller.PolicyRunFiles;
import stirling.software.proprietary.policy.engine.PolicyRunRegistry;
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.EditorConfig;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunView;
import stirling.software.proprietary.policy.model.Schedule;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.network.NetworkProtocol;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.source.EditorSource;
import stirling.software.proprietary.policy.source.SourceController;
import stirling.software.proprietary.policy.source.SourceView;
import stirling.software.proprietary.policy.trigger.TriggerInfo;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.util.SecretMasker;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Saved automations for MCP: the team's server pipelines, read and created through the same
 * controller as the Pipelines UI, so its permission, ownership and validation rules all apply.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpAutomations {

    // The Processor's Pipelines view, mounted under /processor in the web app.
    private static final String PIPELINES_PATH = "/processor/pipelines";

    private final ObjectMapper mapper;
    private final ApplicationProperties applicationProperties;
    private final ObjectProvider<McpToolCatalog> catalog;
    private final ObjectProvider<PolicyController> policies;
    private final ObjectProvider<UserRepository> users;
    private final ObjectProvider<SourceController> sources;
    private final ObjectProvider<PolicyRunRegistry> runs;
    private final ObjectProvider<JobStore> jobStore;
    private final ObjectProvider<InputSource> inputSources;
    private final ObjectProvider<PolicyOutputSink> outputSinks;
    private final ObjectProvider<PolicyManagementAuthority> authority;
    private final Environment environment;

    public McpAutomations(
            ObjectMapper mapper,
            ApplicationProperties applicationProperties,
            ObjectProvider<McpToolCatalog> catalog,
            ObjectProvider<PolicyController> policies,
            ObjectProvider<UserRepository> users,
            ObjectProvider<SourceController> sources,
            ObjectProvider<PolicyRunRegistry> runs,
            ObjectProvider<JobStore> jobStore,
            ObjectProvider<InputSource> inputSources,
            ObjectProvider<PolicyOutputSink> outputSinks,
            ObjectProvider<PolicyManagementAuthority> authority,
            Environment environment) {
        this.authority = authority;
        this.environment = environment;
        this.inputSources = inputSources;
        this.outputSinks = outputSinks;
        this.sources = sources;
        this.runs = runs;
        this.jobStore = jobStore;
        this.mapper = mapper;
        this.applicationProperties = applicationProperties;
        this.catalog = catalog;
        this.policies = policies;
        this.users = users;
    }

    /** A message that is safe to hand back to the model. */
    public static class AutomationException extends Exception {
        public AutomationException(String message) {
            super(message);
        }
    }

    /** A saved automation as the assistant sees it; {@code problem} blocks testing in chat. */
    public record Summary(
            String id,
            String name,
            boolean active,
            String runs,
            List<StepView> steps,
            String problem,
            List<String> sources,
            List<String> destinations) {
        public boolean runnable() {
            return problem == null;
        }
    }

    /** A step's operation and its saved settings, with secrets masked. */
    public record StepView(String operation, Map<String, Object> parameters) {}

    public boolean enabled() {
        return applicationProperties.getMcp().isAutomationsEnabled()
                && policies.getIfAvailable() != null;
    }

    /** The Pipelines page (or one automation in it), or null when no frontend URL is set. */
    public String pipelinesUrl(String automationId) {
        String base = applicationProperties.getSystem().getFrontendUrl();
        if (base == null || base.isBlank()) {
            return null;
        }
        String root = base.trim().replaceAll("/+$", "") + PIPELINES_PATH;
        return automationId == null ? root : root + "/" + automationId;
    }

    /** The tighter of the chat and saved-pipeline step caps; 0 or less means no cap. */
    public int maxSteps() {
        int chat = applicationProperties.getMcp().getMaxPipelineSteps();
        int saved = applicationProperties.getPolicies().getMaxSteps();
        int cap =
                Math.min(
                        chat > 0 ? chat : Integer.MAX_VALUE, saved > 0 ? saved : Integer.MAX_VALUE);
        return cap == Integer.MAX_VALUE ? 100 : cap;
    }

    /** The caller's team automations. */
    public List<Summary> list(String username) throws AutomationException {
        PolicyController controller = requireController();
        List<Policy> visible = asUser(username, controller::listPolicies);
        Map<String, String> names = asUser(username, this::sourceNames);
        List<Summary> out = new ArrayList<>();
        for (Policy policy : visible) {
            List<StepView> steps = new ArrayList<>();
            String problem = null;
            for (PipelineStep step : policy.steps()) {
                OperationMeta meta = metaForPath(step.operation());
                steps.add(
                        new StepView(
                                meta != null ? meta.id() : readableStep(step.operation()),
                                SecretMasker.mask(step.parameters())));
                String why = unrunnable(step, meta);
                problem = problem == null ? why : problem;
            }
            out.add(
                    new Summary(
                            policy.id(),
                            policy.name(),
                            policy.enabled(),
                            runsSummary(policy, names),
                            steps,
                            problem,
                            named(policy.sourceIds(), names),
                            destinationsOf(policy, names)));
        }
        return out;
    }

    /** A saved automation's steps, ready to run as the caller. */
    public List<McpPipelineStep> stepsOf(String username, String automationId)
            throws AutomationException {
        Policy policy = asUser(username, () -> findPolicy(automationId));
        if (policy == null) {
            throw new AutomationException(
                    "Unknown automation '"
                            + automationId
                            + "'. List them with"
                            + " stirling_list_automations.");
        }
        List<McpPipelineStep> steps = new ArrayList<>();
        for (PipelineStep step : policy.steps()) {
            OperationMeta meta = metaForPath(step.operation());
            String problem = unrunnable(step, meta);
            if (problem != null) {
                throw new AutomationException(
                        "Automation '" + policy.name() + "' can't run from chat: " + problem);
            }
            steps.add(new McpPipelineStep(meta, mapper.valueToTree(step.parameters())));
        }
        if (steps.isEmpty()) {
            throw new AutomationException("Automation '" + policy.name() + "' has no steps.");
        }
        return steps;
    }

    /** What to save; null fields keep an existing automation's value, "" clears it. */
    public record Draft(
            String automationId,
            String name,
            List<McpPipelineStep> steps,
            String sourceId,
            JsonNode trigger,
            String destinationId,
            Boolean enabled) {}

    /** Connections the team has, plus the kinds an admin could add (chat apps can't add them). */
    public record Setup(
            List<SourceRef> sources,
            List<TriggerInfo> triggers,
            boolean canSave,
            boolean canTrigger,
            List<String> sourceKinds,
            List<String> destinationKinds) {}

    /** A connection as the assistant needs it: where it points and what running from it does. */
    public record SourceRef(
            String id,
            String name,
            String type,
            String kind,
            boolean paused,
            boolean removesOriginals,
            String location,
            boolean canBeDestination,
            String webhookUrl) {}

    public Setup setup(String username) throws AutomationException {
        PolicyController controller = requireController();
        return asUser(
                username,
                () ->
                        new Setup(
                                connections(),
                                controller.triggers().stream()
                                        .filter(t -> !HIDDEN_TRIGGERS.contains(t.type()))
                                        .toList(),
                                controller.permissions().canManagePolicies(),
                                canTrigger(),
                                sourceKinds(),
                                destinationKinds()));
    }

    // Processing folders are made in the editor, not as Pipelines connections.
    private static final Set<String> HIDDEN_TRIGGERS = Set.of(TriggerConfig.STORAGE_FOLDER_WATCH);
    private static final Set<String> HIDDEN_KINDS = Set.of("storage-folder", "storage", "inline");
    // Sources that delete each processed file unless set to "track" or "snapshot".
    private static final Set<String> CONSUMING_TYPES =
            Set.of("folder", "s3", "sftp", "ftp", "network");

    private boolean saas() {
        return environment != null && environment.matchesProfiles("saas");
    }

    /** Admins (team leaders on SaaS) may run an automation against its sources. */
    private boolean canTrigger() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return true;
        }
        PolicyManagementAuthority check = authority.getIfAvailable();
        return check != null && check.canTriggerPolicies();
    }

    /** The team's connections, minus the editor's own hook, which is not one. */
    List<SourceRef> connections() {
        SourceController controller = sources.getIfAvailable();
        if (controller == null) {
            return List.of();
        }
        Set<String> writable =
                outputSinks.orderedStream().map(PolicyOutputSink::type).collect(Collectors.toSet());
        List<SourceRef> out = new ArrayList<>();
        for (SourceView view : controller.list().sources()) {
            if (EditorSource.TYPE.equals(view.type())) {
                continue;
            }
            Map<String, String> config = new HashMap<>();
            if (view.config() != null) {
                view.config().forEach(row -> config.put(row.label(), row.value()));
            }
            String mode = config.getOrDefault("Mode", "consume");
            boolean removes =
                    CONSUMING_TYPES.contains(view.type())
                            && !"track".equals(mode)
                            && !"snapshot".equals(mode);
            String location =
                    Stream.of("Directory", "Path", "Prefix", "Bucket", "Host")
                            .map(config::get)
                            .filter(v -> v != null && !v.isBlank() && !"null".equals(v))
                            .findFirst()
                            .orElse(null);
            out.add(
                    new SourceRef(
                            view.id(),
                            view.name(),
                            view.type(),
                            KIND_LABELS.getOrDefault(view.type(), view.type()),
                            "disabled".equals(view.status()),
                            removes,
                            location,
                            writable.contains(view.type()),
                            webhookUrl(view.webhookPath())));
        }
        return out;
    }

    /** When and from where an automation runs, in words. */
    String runsSummary(Policy policy, Map<String, String> names) {
        List<String> parts = new ArrayList<>();
        for (PipelineInput input : policy.inputs()) {
            String source = names.getOrDefault(input.sourceId(), input.sourceId());
            TriggerConfig trigger = input.trigger();
            parts.add(
                    trigger == null
                            ? "on demand from " + source
                            : describeTrigger(trigger, source));
        }
        policy.editorRunOn()
                .ifPresent(on -> parts.add("on every " + on + " in the Stirling PDF editor"));
        return parts.isEmpty() ? "on demand only" : String.join("; ", parts);
    }

    private String describeTrigger(TriggerConfig trigger, String source) {
        return switch (trigger.type()) {
            case "schedule" -> describeSchedule(trigger.options()) + " from " + source;
            case "folder-watch", TriggerConfig.STORAGE_FOLDER_WATCH ->
                    "when files arrive in " + source;
            case "webhook" -> "when " + source + " receives a webhook call";
            default -> trigger.type() + " from " + source;
        };
    }

    /** A schedule in words, e.g. "weekly on MONDAY at 09:00 Europe/London". */
    public String describeSchedule(Map<String, Object> options) {
        Schedule schedule = schedule(options);
        if (schedule == null) {
            return "on a schedule";
        }
        ZoneId zoneId = zone(options);
        String zone = " " + (ZoneOffset.UTC.equals(zoneId) ? "UTC" : zoneId.getId());
        return switch (schedule) {
            case Schedule.Every every ->
                    "every " + every.count() + " " + every.unit().name().toLowerCase(Locale.ROOT);
            case Schedule.Daily daily -> "daily at " + daily.at() + zone;
            case Schedule.Weekly weekly ->
                    "weekly on "
                            + String.join(
                                    ", ", weekly.days().stream().sorted().map(Enum::name).toList())
                            + " at "
                            + weekly.at()
                            + zone;
            case Schedule.Monthly monthly ->
                    "monthly on day " + monthly.dayOfMonth() + " at " + monthly.at() + zone;
        };
    }

    /** The next time a schedule fires, or null when it can't be read. */
    public ZonedDateTime nextRun(Map<String, Object> options) {
        Schedule schedule = schedule(options);
        return schedule == null ? null : schedule.nextAfter(ZonedDateTime.now(zone(options)));
    }

    Schedule schedule(Map<String, Object> options) {
        try {
            Object node = options == null ? null : options.get("schedule");
            return node == null ? null : mapper.convertValue(node, Schedule.class);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static ZoneId zone(Map<String, Object> options) {
        Object zone = options == null ? null : options.get("zone");
        try {
            return zone == null || zone.toString().isBlank()
                    ? ZoneOffset.UTC
                    : ZoneId.of(zone.toString());
        } catch (RuntimeException e) {
            return ZoneOffset.UTC;
        }
    }

    /** "/api/v1/misc/ingest" reads as "ingest" when it has no catalog operation. */
    private static String readableStep(String path) {
        if (path == null) {
            return "unknown step";
        }
        String tail = path.replaceAll("/+$", "");
        return tail.substring(tail.lastIndexOf('/') + 1);
    }

    private String webhookUrl(String path) {
        if (path == null) {
            return null;
        }
        String base = applicationProperties.getSystem().getBackendUrl();
        if (base == null || base.isBlank()) {
            base = applicationProperties.getSystem().getFrontendUrl();
        }
        return base == null || base.isBlank() ? path : base.trim().replaceAll("/+$", "") + path;
    }

    /** What was saved, in words the assistant can repeat, plus things to tell the user next. */
    public record Saved(
            String id,
            String name,
            boolean active,
            String runs,
            List<String> destinations,
            List<String> notes) {}

    /** Where an automation reads from and delivers to, and what running it for real does. */
    public record Wiring(
            String id,
            String name,
            List<String> sources,
            List<String> destinations,
            boolean paused,
            List<String> removesOriginalsFrom,
            boolean canTrigger) {}

    public Wiring wiring(String username, String automationId) throws AutomationException {
        requireController();
        Wiring wiring =
                asUser(
                        username,
                        () -> {
                            Policy policy = findPolicy(automationId);
                            if (policy == null) {
                                return null;
                            }
                            Map<String, String> names = sourceNames();
                            Map<String, SourceRef> refs = new HashMap<>();
                            connections().forEach(ref -> refs.put(ref.id(), ref));
                            return new Wiring(
                                    policy.id(),
                                    policy.name(),
                                    named(policy.sourceIds(), names),
                                    named(policy.allOutputIds(), names),
                                    !policy.enabled(),
                                    policy.sourceIds().stream()
                                            .map(refs::get)
                                            .filter(r -> r != null && r.removesOriginals())
                                            .map(SourceRef::name)
                                            .toList(),
                                    canTrigger());
                        });
        if (wiring == null) {
            throw new AutomationException(
                    "Unknown automation '"
                            + sanitize(automationId)
                            + "'. Call stirling_list_automations for the ids.");
        }
        return wiring;
    }

    /** Runs started for real; {@code sweep} explains an empty source pull. */
    public record Started(List<String> runIds, SweepOutcome sweep) {}

    /**
     * Runs an automation as if its trigger fired: from its sources, or on {@code files} instead,
     * and always into its destinations. Same checks as the Pipelines page's Run now and upload.
     */
    public Started trigger(String username, String automationId, List<MultipartFile> files)
            throws AutomationException {
        PolicyController controller = requireController();
        try {
            if (files.isEmpty()) {
                SweepOutcome sweep =
                        asUser(username, () -> controller.trigger(automationId).getBody());
                return new Started(sweep == null ? List.of() : sweep.runIds(), sweep);
            }
            PolicyRunFiles runFiles = new PolicyRunFiles();
            runFiles.setFileInput(new ArrayList<>(files));
            String runId =
                    asUser(
                            username,
                            () -> {
                                try {
                                    return controller
                                            .runStoredPolicy(automationId, runFiles)
                                            .getBody()
                                            .getJobId();
                                } catch (IOException e) {
                                    throw new UncheckedIOException(e);
                                }
                            });
            return new Started(List.of(runId), null);
        } catch (ResponseStatusException e) {
            throw new AutomationException(triggerRefusal(e));
        } catch (IllegalStateException | UncheckedIOException e) {
            throw new AutomationException(
                    "The automation could not start: " + sanitize(e.getMessage()));
        }
    }

    private static String triggerRefusal(ResponseStatusException e) {
        return switch (e.getStatusCode().value()) {
            case 403 ->
                    "Only an admin or team leader can run an automation against its sources. Give"
                            + " it a file instead: the result still goes to its destination.";
            case 404 -> "Unknown automation. Call stirling_list_automations for the ids.";
            default ->
                    "The automation could not start: "
                            + sanitize(e.getReason() != null ? e.getReason() : e.getMessage());
        };
    }

    /**
     * Recent runs the caller can see, newest first: of one automation, of all of them, or the given
     * run ids. Runs belong to whoever owns the files, so an admin sees runs on their own sources
     * and uploads.
     */
    public List<PolicyRunView> runs(String username, String automationId, List<String> runIds)
            throws AutomationException {
        PolicyController controller = requireController();
        List<PolicyRunView> found =
                asUser(
                        username,
                        () -> {
                            if (runIds != null && !runIds.isEmpty()) {
                                List<PolicyRunView> views = new ArrayList<>();
                                for (String runId : runIds) {
                                    PolicyRunView view = controller.status(runId).getBody();
                                    if (view != null) {
                                        views.add(view);
                                    }
                                }
                                return views;
                            }
                            return controller.listRuns(automationId);
                        });
        return found.stream()
                .sorted((a, b) -> Long.compare(b.createdAt(), a.createdAt()))
                .limit(MAX_LISTED_RUNS)
                .toList();
    }

    private static final int MAX_LISTED_RUNS = 20;

    /** Waits for these runs to finish, up to {@code max}; unknown runs come back null. */
    public List<PolicyRunView> await(List<String> runIds, Duration max) {
        long deadline = System.nanoTime() + max.toNanos();
        while (true) {
            List<PolicyRunView> views = runIds.stream().map(this::view).toList();
            boolean done = views.stream().allMatch(v -> v != null && v.status().isTerminal());
            if (done || System.nanoTime() > deadline) {
                return views;
            }
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return views;
            }
        }
    }

    private PolicyRunView view(String runId) {
        PolicyRunRegistry registry = runs.getIfAvailable();
        PolicyRun run = registry == null ? null : registry.get(runId);
        if (run != null) {
            return PolicyRunView.of(run);
        }
        // Another node may own the run; its shared projection still has the status.
        JobStore store = jobStore.getIfAvailable();
        return store == null
                ? null
                : store.get(runId)
                        .filter(
                                e ->
                                        e.resultMeta() != null
                                                && e.resultMeta().containsKey("policyId"))
                        .map(PolicyRunView::ofEntry)
                        .orElse(null);
    }

    // Readable names for connection types; unknown types show their id.
    private static final Map<String, String> KIND_LABELS =
            Map.ofEntries(
                    Map.entry("folder", "server folder"),
                    Map.entry("s3", "S3 bucket"),
                    Map.entry("storage-folder", "Stirling storage folder"),
                    Map.entry("storage", "Stirling storage"),
                    Map.entry("webhook", "webhook"),
                    Map.entry("sftp", "SFTP"),
                    Map.entry("ftp", "FTP"),
                    Map.entry("network", "SMB share"),
                    Map.entry("vectordb", "vector database"));

    private List<String> sourceKinds() {
        java.util.Set<String> kinds = new java.util.LinkedHashSet<>();
        inputSources
                .orderedStream()
                .map(InputSource::type)
                .filter(type -> !EditorSource.TYPE.equals(type) && !hiddenKind(type))
                .forEach(kinds::add);
        // One network source serves every protocol it knows.
        if (kinds.contains(NetworkProtocol.SMB.sourceType())) {
            for (NetworkProtocol protocol : NetworkProtocol.values()) {
                kinds.add(protocol.sourceType());
            }
        }
        return kinds.stream().map(k -> KIND_LABELS.getOrDefault(k, k)).distinct().toList();
    }

    private List<String> destinationKinds() {
        return outputSinks
                .orderedStream()
                .map(PolicyOutputSink::type)
                .filter(type -> !hiddenKind(type))
                .map(k -> KIND_LABELS.getOrDefault(k, k))
                .distinct()
                .toList();
    }

    // Server folders are refused on SaaS, so they are not offered there.
    private boolean hiddenKind(String type) {
        return HIDDEN_KINDS.contains(type) || (saas() && "folder".equals(type));
    }

    private Map<String, String> sourceNames() {
        SourceController controller = sources.getIfAvailable();
        Map<String, String> names = new HashMap<>();
        if (controller != null) {
            controller.list().sources().forEach(v -> names.put(v.id(), v.name()));
        }
        return names;
    }

    // An editor automation returns its results into the editor rather than a stored destination.
    private static List<String> destinationsOf(Policy policy, Map<String, String> names) {
        return policy.editor().allowed()
                ? List.of("the Stirling PDF editor")
                : named(policy.allOutputIds(), names);
    }

    private static List<String> named(List<String> ids, Map<String, String> names) {
        return ids.stream().map(id -> names.getOrDefault(id, id)).toList();
    }

    /** Creates or updates an automation for the caller's team. */
    public Saved save(String username, Draft draft) throws AutomationException {
        PolicyController controller = requireController();
        Policy existing = null;
        if (draft.automationId() != null && !draft.automationId().isBlank()) {
            existing = asUser(username, () -> findPolicy(draft.automationId()));
            if (existing == null) {
                throw new AutomationException("Unknown automation '" + draft.automationId() + "'.");
            }
        }
        List<PipelineStep> steps = existing == null ? List.of() : existing.steps();
        if (draft.steps() != null) {
            steps = new ArrayList<>();
            for (McpPipelineStep step : draft.steps()) {
                Map<String, Object> parameters =
                        step.parameters() == null || !step.parameters().isObject()
                                ? Map.of()
                                : mapper.convertValue(
                                        step.parameters(),
                                        new TypeReference<Map<String, Object>>() {});
                steps.add(new PipelineStep(step.meta().endpointPath(), parameters));
            }
        }
        if (steps.isEmpty()) {
            throw new AutomationException("An automation needs at least one step.");
        }
        EditorConfig editor = editorConfig(draft, existing);
        boolean onEditor = editor != null && editor.allowed();
        if (onEditor && draft.destinationId() != null && !draft.destinationId().isBlank()) {
            throw new AutomationException(
                    "Editor automations return their results to the editor, so they take no"
                            + " destination.");
        }
        Policy candidate =
                new Policy(
                        existing == null ? null : existing.id(),
                        draft.name() != null
                                ? draft.name()
                                : existing == null ? null : existing.name(),
                        existing == null ? null : existing.owner(),
                        draft.enabled() != null
                                ? draft.enabled()
                                : existing == null || existing.enabled(),
                        existing != null && existing.required(),
                        existing == null ? "" : existing.icon(),
                        onEditor ? List.of() : inputs(draft, existing),
                        steps,
                        existing == null ? OutputSpec.inline() : existing.output(),
                        onEditor ? List.of() : outputs(draft, existing),
                        existing == null ? null : existing.teamId(),
                        editor,
                        existing == null ? null : existing.surface(),
                        onEditor || existing == null ? List.of() : existing.routingRules());
        try {
            Policy saved = asUser(username, () -> controller.savePolicy(candidate).getBody());
            if (saved == null || saved.id() == null) {
                throw new AutomationException("The automation could not be saved.");
            }
            log.info(
                    "MCP saved automation '{}' with {} step(s)",
                    sanitize(saved.name()),
                    saved.steps().size());
            return asUser(username, () -> describeSaved(saved));
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == 403) {
                throw new AutomationException(
                        "Only a Stirling PDF admin (or team leader) can save automations. Run the"
                                + " steps now with stirling_run_pipeline, and suggest the user asks"
                                + " their admin to save this workflow as a pipeline in Stirling"
                                + " PDF so it can run automatically.");
            }
            throw new AutomationException("Could not save the automation: " + e.getReason());
        }
    }

    private Saved describeSaved(Policy saved) {
        Map<String, String> names = sourceNames();
        Map<String, SourceRef> refs = new HashMap<>();
        connections().forEach(ref -> refs.put(ref.id(), ref));
        List<String> destinations = destinationsOf(saved, names);
        List<String> notes = new ArrayList<>();
        for (PipelineInput input : saved.inputs()) {
            TriggerConfig trigger = input.trigger();
            SourceRef source = refs.get(input.sourceId());
            String sourceName = source != null ? source.name() : input.sourceId();
            if (source != null && source.paused()) {
                notes.add(sourceName + " is paused, so nothing runs until an admin resumes it.");
            }
            if (trigger == null) {
                continue;
            }
            if (destinations.isEmpty()) {
                notes.add(
                        "It has no destination, so automatic results are not delivered anywhere"
                                + " the user can open them; add a destination for that.");
            }
            if (source != null && source.removesOriginals()) {
                notes.add(sourceName + " removes each file once it has been processed.");
            }
            switch (trigger.type()) {
                case "schedule" -> {
                    ZonedDateTime next = nextRun(trigger.options());
                    if (next != null) {
                        notes.add(
                                "Next run: "
                                        + next.format(
                                                DateTimeFormatter.ofPattern(
                                                        "EEE d MMM yyyy HH:mm z", Locale.ENGLISH))
                                        + ".");
                    }
                    if (!(schedule(trigger.options()) instanceof Schedule.Every)) {
                        notes.add(
                                "The Pipelines page can't show this kind of schedule yet (it"
                                        + " shows it as hourly, and saving there resets it), so"
                                        + " change the schedule from chat.");
                    }
                }
                case "folder-watch" ->
                        notes.add(
                                "Files already in "
                                        + sourceName
                                        + " are picked up within a few minutes; new ones as"
                                        + " they arrive.");
                case "webhook" -> {
                    String url = source != null ? source.webhookUrl() : null;
                    notes.add(
                            "To start it, POST the raw file to "
                                    + (url != null ? url : "the webhook's URL (see Pipelines)")
                                    + " with header X-Stirling-Signature: sha256=<HMAC-SHA256 of"
                                    + " the body using the webhook's signing secret, shown when"
                                    + " the connection was created> and optionally"
                                    + " X-Stirling-Filename.");
                }
                default -> {}
            }
        }
        return new Saved(
                saved.id(),
                saved.name(),
                saved.enabled(),
                runsSummary(saved, names),
                destinations,
                notes.stream().distinct().toList());
    }

    /**
     * The editor is not a connection: like the Pipelines page, "run on every upload or export" is
     * stored as the policy's editor setting with no inputs or destinations.
     */
    private static EditorConfig editorConfig(Draft draft, Policy existing)
            throws AutomationException {
        JsonNode trigger = draft.trigger();
        String type = trigger == null ? "" : trigger.path("type").asText("");
        boolean editorTrigger =
                EditorConfig.UPLOAD.equals(type) || EditorConfig.EXPORT.equals(type);
        if (EditorSource.ID.equals(draft.sourceId())) {
            if (trigger != null && !trigger.isNull() && !editorTrigger) {
                throw new AutomationException(
                        "The editor runs automations on 'upload' or 'export'; use trigger"
                                + " {\"type\":\"upload\"} or {\"type\":\"export\"}.");
            }
            return new EditorConfig(true, editorTrigger ? type : EditorConfig.UPLOAD);
        }
        if (draft.sourceId() != null) {
            return EditorConfig.disabled();
        }
        if (editorTrigger) {
            if (existing == null || !existing.editor().allowed()) {
                throw new AutomationException("Upload and export triggers need sourceId 'editor'.");
            }
            return new EditorConfig(true, type);
        }
        return existing == null ? EditorConfig.disabled() : existing.editor();
    }

    private List<PipelineInput> inputs(Draft draft, Policy existing) throws AutomationException {
        JsonNode trigger = draft.trigger();
        boolean hasTrigger = trigger != null && !trigger.isNull();
        if (hasTrigger && (!trigger.isObject() || trigger.path("type").asText("").isBlank())) {
            throw new AutomationException(
                    "'trigger' needs a 'type' (schedule, folder-watch or webhook) and its"
                            + " 'options'; see stirling_save_automation's trigger description.");
        }
        PipelineInput current =
                existing != null && existing.inputs().size() == 1 ? existing.inputs().get(0) : null;
        String sourceId = draft.sourceId();
        if (sourceId == null) {
            if (!hasTrigger) {
                return existing == null ? List.of() : existing.inputs();
            }
            if (current == null) {
                throw new AutomationException(
                        "A trigger needs a 'sourceId' to pull files from; see"
                                + " stirling_list_automations for the team's sources.");
            }
            // Changing only the trigger keeps the current source.
            sourceId = current.sourceId();
        }
        if (sourceId.isBlank()) {
            return List.of();
        }
        if (!hasTrigger) {
            // Changing only the source keeps the current trigger; trigger:null removes it.
            boolean keep = trigger == null && current != null && current.trigger() != null;
            return List.of(
                    keep
                            ? new PipelineInput(sourceId, current.trigger())
                            : PipelineInput.manual(sourceId));
        }
        Map<String, Object> options =
                trigger.has("options") && trigger.get("options").isObject()
                        ? mapper.convertValue(
                                trigger.get("options"), new TypeReference<Map<String, Object>>() {})
                        : Map.of();
        return List.of(
                new PipelineInput(
                        sourceId, new TriggerConfig(trigger.get("type").asText(), options)));
    }

    private static List<String> outputs(Draft draft, Policy existing) {
        if (draft.destinationId() == null) {
            return existing == null ? List.of() : existing.outputIds();
        }
        return draft.destinationId().isBlank() ? List.of() : List.of(draft.destinationId());
    }

    private Policy findPolicy(String id) {
        PolicyController controller = policies.getIfAvailable();
        if (controller == null || id == null || id.isBlank()) {
            return null;
        }
        return controller.listPolicies().stream()
                .filter(p -> id.equals(p.id()))
                .findFirst()
                .orElse(null);
    }

    /** Why MCP can't run this step, or null when it can. */
    private static String unrunnable(PipelineStep step, OperationMeta meta) {
        if (!step.fileParameters().isEmpty()) {
            return "it uses a supporting file (e.g. a stamp image), which a chat test can't"
                    + " supply";
        }
        if (meta == null) {
            return "step '" + readableStep(step.operation()) + "' only runs inside Stirling PDF";
        }
        return null;
    }

    /** The MCP operation behind an endpoint path, if chat apps may use it. */
    private OperationMeta metaForPath(String path) {
        McpToolCatalog tools = catalog.getIfAvailable();
        if (tools == null || path == null) {
            return null;
        }
        return tools.findByEndpointPath(path).orElse(null);
    }

    private PolicyController requireController() throws AutomationException {
        PolicyController controller = policies.getIfAvailable();
        if (controller == null || !applicationProperties.getMcp().isAutomationsEnabled()) {
            throw new AutomationException("Saved automations are not available on this server.");
        }
        return controller;
    }

    /**
     * MCP calls carry only OAuth scope authorities; the pipelines API needs the user's own roles
     * (team, admin), so act as a normal session of that same user for this call.
     */
    private <T> T asUser(String username, Supplier<T> work) throws AutomationException {
        UserRepository repository = users.getIfAvailable();
        if (username == null || repository == null) {
            return work.get();
        }
        // Not loadUserByUsername: that is form login's check and rejects password-less (SaaS)
        // users.
        User details =
                repository
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(
                                () ->
                                        new AutomationException(
                                                "Your Stirling PDF account could not be loaded."));
        SecurityContext previous = SecurityContextHolder.getContext();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(
                new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities()));
        SecurityContextHolder.setContext(context);
        try {
            return work.get();
        } finally {
            SecurityContextHolder.setContext(previous);
        }
    }

    private static String sanitize(String value) {
        return value == null ? null : value.replace('\r', ' ').replace('\n', ' ');
    }

    /** Reads {@code steps} from tool arguments into catalog operations, or explains the problem. */
    public List<McpPipelineStep> parseSteps(JsonNode stepsNode, McpCallContext context)
            throws AutomationException {
        McpToolCatalog tools = catalog.getIfAvailable();
        if (tools == null) {
            throw new AutomationException("MCP catalog is not available.");
        }
        if (stepsNode == null || !stepsNode.isArray() || stepsNode.isEmpty()) {
            throw new AutomationException(
                    "Pass 'steps': a list of {operation, parameters}, in the order to run them.");
        }
        if (stepsNode.size() > maxSteps()) {
            throw new AutomationException(
                    "At most "
                            + maxSteps()
                            + " steps are allowed in one pipeline. Split it: run the first steps,"
                            + " then pass the result fileId to another stirling_run_pipeline"
                            + " call.");
        }
        List<McpPipelineStep> steps = new ArrayList<>();
        for (int i = 0; i < stepsNode.size(); i++) {
            JsonNode step = stepsNode.get(i);
            String id = step.path("operation").asText("");
            OperationMeta meta = tools.findByOperationId(id).orElse(null);
            if (meta == null) {
                throw new AutomationException(
                        "Step "
                                + (i + 1)
                                + ": unknown or disabled operation '"
                                + id
                                + "'. Use operation ids from the Stirling category tools.");
            }
            if (context != null && !context.hasScope(meta.requiredScope())) {
                throw new AutomationException(
                        "Step "
                                + (i + 1)
                                + " ("
                                + id
                                + ") needs the '"
                                + meta.requiredScope()
                                + "' scope.");
            }
            steps.add(new McpPipelineStep(meta, step.get("parameters")));
        }
        return steps;
    }
}
