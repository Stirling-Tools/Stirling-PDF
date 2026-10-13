package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.InternalApiClient;
import stirling.software.proprietary.mcp.McpAutomations;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.policy.controller.PolicyController;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class McpPipelineTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final McpCallContext context =
            new McpCallContext("alice", Set.of("mcp.tools.read", "mcp.tools.write"), true);
    private final User alice = new User();
    private final InternalApiClient api = mock(InternalApiClient.class);
    private final McpFiles files = mock(McpFiles.class);
    private final McpToolCatalog catalog = mock(McpToolCatalog.class);
    private final PolicyController policies = mock(PolicyController.class);
    private final ApplicationProperties props = new ApplicationProperties();
    private final McpOperationExecutor executor =
            new McpOperationExecutor(mapper, api, files, mock(McpFileUrlFetcher.class), null, null);
    private final McpAutomations automations =
            new McpAutomations(
                    mapper,
                    props,
                    provider(catalog),
                    provider(policies),
                    provider(null),
                    provider(null),
                    provider(null),
                    provider(null),
                    provider(null),
                    provider(null),
                    provider(null),
                    new org.springframework.core.env.StandardEnvironment());

    @BeforeEach
    void setUp() throws Exception {
        when(files.user(any())).thenReturn(alice);
        when(files.save(
                        eq(alice),
                        any(Resource.class),
                        anyString(),
                        anyString(),
                        anyLong(),
                        eq(true)))
                .thenReturn(
                        new McpFiles.Saved(
                                "9", "out.pdf", "application/pdf", 3, null, null, false, null));
        when(catalog.findByOperationId(anyString())).thenReturn(Optional.empty());
        when(catalog.findByEndpointPath(anyString())).thenReturn(Optional.empty());
        for (OperationMeta op :
                List.of(
                        op("repair", OperationCategory.MISC, "/api/v1/misc/repair"),
                        op("compress-pdf", OperationCategory.MISC, "/api/v1/misc/compress-pdf"),
                        op(
                                "get-info-on-pdf",
                                OperationCategory.SECURITY,
                                "/api/v1/security/get-info-on-pdf"),
                        op("summarise", OperationCategory.AI, null))) {
            when(catalog.findByOperationId(op.id())).thenReturn(Optional.of(op));
            if (op.endpointPath() != null) {
                when(catalog.findByEndpointPath(op.endpointPath())).thenReturn(Optional.of(op));
            }
        }
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void eachStepFeedsTheNextAndOnlyTheLastIsStored() throws Exception {
        when(api.post(eq("/api/v1/misc/repair"), any())).thenReturn(pdf("REPAIRED"));
        when(api.post(eq("/api/v1/misc/compress-pdf"), any())).thenReturn(pdf("SMALL"));

        ObjectNode result = run(steps("repair", "compress-pdf"));

        assertFalse(result.path("isError").asBoolean(false), result.toString());
        ArgumentCaptor<MultiValueMap> second = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(api).post(eq("/api/v1/misc/compress-pdf"), second.capture());
        Resource fed = (Resource) second.getValue().getFirst("fileInput");
        assertEquals("REPAIRED", new String(fed.getContentAsByteArray(), StandardCharsets.UTF_8));
        verify(files)
                .save(
                        eq(alice),
                        any(Resource.class),
                        anyString(),
                        anyString(),
                        anyLong(),
                        eq(true));
        assertTrue(text(result).startsWith("Ran 2 steps: repair > compress-pdf."));
        assertEquals("9", result.at("/structuredContent/fileId").asText());
    }

    @Test
    void aReportInTheMiddleStopsThePipelineAndSaysWhy() throws Exception {
        HttpHeaders json = new HttpHeaders();
        json.setContentType(MediaType.APPLICATION_JSON);
        when(api.post(eq("/api/v1/security/get-info-on-pdf"), any()))
                .thenReturn(
                        ResponseEntity.ok()
                                .headers(json)
                                .body(new ByteArrayResource("{}".getBytes())));

        ObjectNode result = run(steps("get-info-on-pdf", "compress-pdf"));

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(text(result).contains("Step 1 of 2 (get-info-on-pdf)"));
        assertTrue(text(result).contains("last step"));
        verify(api, never()).post(eq("/api/v1/misc/compress-pdf"), any());
    }

    @Test
    void unknownStepsAreRefusedBeforeAnythingRuns() {
        assertThrows(
                McpAutomations.AutomationException.class,
                () -> automations.parseSteps(steps("repair", "blocked-op"), context));
    }

    @Test
    void aiStepsRunInPipelinesNowThatTheyAreBilledJavaEndpoints() throws Exception {
        List<McpPipelineStep> steps = automations.parseSteps(steps("summarise"), context);

        assertEquals("summarise", steps.get(0).meta().id());
    }

    @Test
    void stepCountIsCapped() {
        props.getMcp().setMaxPipelineSteps(2);
        assertThrows(
                McpAutomations.AutomationException.class,
                () -> automations.parseSteps(steps("repair", "repair", "repair"), context));
    }

    @Test
    void missingScopeIsRefused() {
        McpCallContext readOnly = new McpCallContext("alice", Set.of("mcp.tools.read"), true);
        assertThrows(
                McpAutomations.AutomationException.class,
                () -> automations.parseSteps(steps("repair"), readOnly));
    }

    @Test
    void savedAutomationsListWithStepIdsAndFlagWhatChatCannotRun() throws Exception {
        when(policies.listPolicies())
                .thenReturn(
                        List.of(
                                policy("p1", "Email ready", step("/api/v1/misc/compress-pdf")),
                                policy("p2", "Upload to S3", step("/api/v1/integration/s3"))));

        List<McpAutomations.Summary> list = automations.list("alice");

        assertEquals("compress-pdf", list.get(0).steps().get(0).operation());
        assertTrue(list.get(0).runnable());
        assertTrue(list.get(0).active());
        assertEquals("on demand only", list.get(0).runs());
        assertTrue(!list.get(1).runnable() && list.get(1).problem().contains("only runs inside"));
        assertEquals("s3", list.get(1).steps().get(0).operation());
    }

    @Test
    void schedulesReadAsWordsWithTheirNextRun() {
        java.util.Map<String, Object> weekly =
                java.util.Map.of(
                        "schedule",
                        java.util.Map.of(
                                "type",
                                "weekly",
                                "days",
                                List.of("THURSDAY", "MONDAY"),
                                "at",
                                "09:00"),
                        "zone",
                        "Europe/London");

        assertEquals(
                "weekly on MONDAY, THURSDAY at 09:00 Europe/London",
                automations.describeSchedule(weekly));
        assertEquals(
                "every 2 hours",
                automations.describeSchedule(
                        java.util.Map.of(
                                "schedule",
                                java.util.Map.of("type", "every", "count", 2, "unit", "HOURS"))));
        assertTrue(automations.nextRun(weekly).isAfter(java.time.ZonedDateTime.now()));
    }

    @Test
    void runningASavedAutomationUsesItsSteps() throws Exception {
        when(policies.listPolicies())
                .thenReturn(
                        List.of(policy("p1", "Email ready", step("/api/v1/misc/compress-pdf"))));

        List<McpPipelineStep> steps = automations.stepsOf("alice", "p1");

        assertEquals("compress-pdf", steps.get(0).meta().id());
        assertThrows(
                McpAutomations.AutomationException.class,
                () -> automations.stepsOf("alice", "someone-elses"));
    }

    @Test
    void savingStoresEndpointStepsAsAnOnDemandInlineAutomation() throws Exception {
        when(policies.savePolicy(any()))
                .thenAnswer(
                        i -> {
                            Policy p = i.getArgument(0);
                            return ResponseEntity.ok(
                                    new Policy(
                                            "new-id",
                                            p.name(),
                                            "alice",
                                            p.enabled(),
                                            p.inputs(),
                                            p.steps(),
                                            p.output(),
                                            p.outputIds(),
                                            1L));
                        });

        String id =
                automations
                        .save(
                                "alice",
                                draft(null, "Email ready", steps("repair"), null, null, null))
                        .id();

        assertEquals("new-id", id);
        ArgumentCaptor<Policy> saved = ArgumentCaptor.forClass(Policy.class);
        verify(policies).savePolicy(saved.capture());
        assertEquals("/api/v1/misc/repair", saved.getValue().steps().get(0).operation());
        assertTrue(saved.getValue().inputs().isEmpty(), "no trigger: runs on demand only");
        assertEquals(OutputSpec.inline().type(), saved.getValue().output().type());
    }

    @Test
    void nonAdminsAreToldTheyCanStillRunSteps() {
        when(policies.savePolicy(any()))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "no"));

        McpAutomations.AutomationException e =
                assertThrows(
                        McpAutomations.AutomationException.class,
                        () ->
                                automations.save(
                                        "alice",
                                        draft(null, "x", steps("repair"), null, null, null)));
        assertTrue(e.getMessage().contains("stirling_run_pipeline"));
    }

    @Test
    void automationsCanBeTurnedOff() {
        props.getMcp().setAutomationsEnabled(false);
        ObjectNode result =
                new StirlingRunPipelineTool(mapper, automations, provider(executor))
                        .call(args(steps("repair")), context);
        assertTrue(result.path("isError").asBoolean(false));
    }

    @Test
    void anAutomationCanBeSetUpToRunByItselfWithATriggerAndDestination() throws Exception {
        stubSaveEcho();
        ObjectNode trigger = mapper.createObjectNode().put("type", "schedule");
        trigger.putObject("options").putObject("schedule").put("type", "daily").put("at", "09:00");

        automations.save(
                "alice", draft(null, "Nightly", steps("repair"), "inbox", trigger, "archive"));

        ArgumentCaptor<Policy> saved = ArgumentCaptor.forClass(Policy.class);
        verify(policies).savePolicy(saved.capture());
        Policy policy = saved.getValue();
        assertEquals("inbox", policy.inputs().get(0).sourceId());
        assertEquals("schedule", policy.inputs().get(0).trigger().type());
        assertEquals(List.of("archive"), policy.outputIds());
    }

    @Test
    void triggerModeRunsTheAutomationAgainstItsSources() {
        Policy policy =
                new Policy(
                        "p1",
                        "Inbox cleanup",
                        "admin",
                        true,
                        List.of(
                                stirling.software.proprietary.policy.model.PipelineInput.manual(
                                        "inbox")),
                        List.of(step("/api/v1/misc/compress-pdf")),
                        OutputSpec.inline(),
                        List.of("archive"),
                        1L);
        when(policies.listPolicies()).thenReturn(List.of(policy));
        when(policies.trigger("p1"))
                .thenReturn(
                        org.springframework.http.ResponseEntity.ok(
                                new stirling.software.proprietary.policy.engine.SweepOutcome(
                                        List.of(), 3, 3, 0, 0, 0)));
        McpAutomationTrigger trigger =
                new McpAutomationTrigger(
                        mapper, automations, files, provider(null), provider(null));
        props.getSecurity().setEnableLogin(false);
        StirlingRunAutomationTool tool =
                new StirlingRunAutomationTool(mapper, automations, provider(trigger));
        ObjectNode ask = mapper.createObjectNode().put("automationId", "p1");

        String plan = text(tool.call(ask, context));
        ObjectNode result = tool.call(ask.deepCopy().put("confirmed", true), context);

        assertTrue(plan.startsWith("Not run yet."), plan);
        assertTrue(plan.contains("every new file in inbox"), plan);
        verify(policies).trigger("p1");
        assertEquals("automation", result.path("structuredContent").path("kind").asText());
        assertTrue(result.toString().contains("processed before"), result.toString());
    }

    @Test
    void anAutomationWithNoModeOrFileAsksHowToRunIt() {
        ObjectNode result =
                new StirlingRunPipelineTool(mapper, automations, provider(executor))
                        .call(mapper.createObjectNode().put("automationId", "p1"), context);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(result.toString().contains("stirling_run_automation"), result.toString());
    }

    @Test
    void changingOnlyTheTriggerOrOnlyTheSourceKeepsTheOther() throws Exception {
        stubSaveEcho();
        ObjectNode daily = mapper.createObjectNode().put("type", "schedule");
        daily.putObject("options").putObject("schedule").put("type", "daily").put("at", "09:00");
        Policy existing =
                new Policy(
                        "p1",
                        "Nightly",
                        "admin",
                        true,
                        List.of(
                                new stirling.software.proprietary.policy.model.PipelineInput(
                                        "inbox",
                                        new stirling.software.proprietary.policy.model
                                                .TriggerConfig("webhook", java.util.Map.of()))),
                        List.of(step("/api/v1/misc/compress-pdf")),
                        OutputSpec.inline(),
                        List.of(),
                        1L);
        when(policies.listPolicies()).thenReturn(List.of(existing));
        ArgumentCaptor<Policy> saved = ArgumentCaptor.forClass(Policy.class);

        automations.save("alice", draft("p1", null, null, null, daily, null));
        automations.save("alice", draft("p1", null, null, "archive", null, null));

        verify(policies, org.mockito.Mockito.times(2)).savePolicy(saved.capture());
        assertEquals("inbox", saved.getAllValues().get(0).inputs().get(0).sourceId());
        assertEquals("schedule", saved.getAllValues().get(0).inputs().get(0).trigger().type());
        assertEquals("archive", saved.getAllValues().get(1).inputs().get(0).sourceId());
        assertEquals("webhook", saved.getAllValues().get(1).inputs().get(0).trigger().type());
    }

    @Test
    void aTriggerWithoutATypeIsRefusedInsteadOfSavedAsOnDemand() {
        ObjectNode noType = mapper.createObjectNode();
        noType.putObject("options");
        assertThrows(
                McpAutomations.AutomationException.class,
                () ->
                        automations.save(
                                "alice", draft(null, "x", steps("repair"), "inbox", noType, null)));
    }

    @Test
    void editorAutomationsAreStoredAsTheEditorSettingNotASource() throws Exception {
        stubSaveEcho();
        ObjectNode onExport = mapper.createObjectNode().put("type", "export");

        automations.save(
                "alice", draft(null, "Tidy exports", steps("repair"), "editor", onExport, null));

        ArgumentCaptor<Policy> saved = ArgumentCaptor.forClass(Policy.class);
        verify(policies).savePolicy(saved.capture());
        assertTrue(saved.getValue().inputs().isEmpty());
        assertTrue(saved.getValue().editor().allowed());
        assertEquals("export", saved.getValue().editor().runOn());
        assertTrue(saved.getValue().outputIds().isEmpty());
    }

    @Test
    void savingConfirmsWhenItRunsAndWhatTheUserMustKnow() {
        stubSaveEcho();
        ObjectNode args = mapper.createObjectNode().put("name", "Morning").put("sourceId", "inbox");
        args.set("steps", steps("repair"));
        ObjectNode trigger = args.putObject("trigger").put("type", "schedule");
        trigger.putObject("options").putObject("schedule").put("type", "daily").put("at", "09:00");

        String reply =
                text(new StirlingSaveAutomationTool(mapper, automations).call(args, context));

        assertTrue(reply.contains("runs daily at 09:00 UTC from inbox"), reply);
        assertTrue(reply.contains("Next run:"), reply);
        assertTrue(reply.contains("no destination"), reply);
        assertTrue(reply.contains("Pipelines page can't show this kind of schedule"), reply);
    }

    @Test
    void aTriggerWithoutASourceIsRefused() {
        ObjectNode trigger = mapper.createObjectNode().put("type", "schedule");
        assertThrows(
                McpAutomations.AutomationException.class,
                () ->
                        automations.save(
                                "alice", draft(null, "x", steps("repair"), null, trigger, null)));
    }

    @Test
    void updatingKeepsWhatWasNotChanged() throws Exception {
        stubSaveEcho();
        Policy existing =
                new Policy(
                        "p1",
                        "Old",
                        "admin",
                        true,
                        List.of(
                                stirling.software.proprietary.policy.model.PipelineInput.manual(
                                        "inbox")),
                        List.of(step("/api/v1/misc/compress-pdf")),
                        OutputSpec.inline(),
                        List.of("archive"),
                        1L);
        when(policies.listPolicies()).thenReturn(List.of(existing));

        automations.save("alice", draft("p1", "Renamed", null, null, null, ""));

        ArgumentCaptor<Policy> saved = ArgumentCaptor.forClass(Policy.class);
        verify(policies).savePolicy(saved.capture());
        assertEquals("p1", saved.getValue().id());
        assertEquals("Renamed", saved.getValue().name());
        assertEquals("/api/v1/misc/compress-pdf", saved.getValue().steps().get(0).operation());
        assertEquals("inbox", saved.getValue().inputs().get(0).sourceId());
        assertTrue(saved.getValue().outputIds().isEmpty(), "'' clears the destination");
    }

    private void stubSaveEcho() {
        when(policies.savePolicy(any()))
                .thenAnswer(
                        i -> {
                            Policy p = i.getArgument(0);
                            return ResponseEntity.ok(
                                    new Policy(
                                            p.id() == null ? "new-id" : p.id(),
                                            p.name(),
                                            "alice",
                                            p.enabled(),
                                            p.inputs(),
                                            p.steps(),
                                            p.output(),
                                            p.outputIds(),
                                            1L));
                        });
    }

    private McpAutomations.Draft draft(
            String id,
            String name,
            ArrayNode steps,
            String sourceId,
            ObjectNode trigger,
            String destinationId)
            throws McpAutomations.AutomationException {
        return new McpAutomations.Draft(
                id,
                name,
                steps == null ? null : automations.parseSteps(steps, context),
                sourceId,
                trigger,
                destinationId,
                null);
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void aSplitInTheMiddleCarriesEachPieceThroughTheRestOfThePipeline() throws Exception {
        when(catalog.findByOperationId("split-pages"))
                .thenReturn(
                        Optional.of(
                                op(
                                        "split-pages",
                                        OperationCategory.PAGES,
                                        "/api/v1/general/split-pages")));
        when(api.post(eq("/api/v1/general/split-pages"), any()))
                .thenReturn(zip("a.pdf", "PART-A", "b.pdf", "PART-B"));
        when(api.post(eq("/api/v1/misc/compress-pdf"), any()))
                .thenReturn(pdf("SMALL"), pdf("SMALL"));
        when(files.save(eq(alice), any(byte[].class), anyString(), anyString(), eq(true)))
                .thenAnswer(
                        i ->
                                new McpFiles.Saved(
                                        "id-" + i.getArgument(2),
                                        i.getArgument(2),
                                        "application/pdf",
                                        5,
                                        null,
                                        null,
                                        false,
                                        null));

        ObjectNode result = run(steps("split-pages", "compress-pdf"));

        assertFalse(result.path("isError").asBoolean(false), result.toString());
        verify(api, org.mockito.Mockito.times(2))
                .post(eq("/api/v1/misc/compress-pdf"), any(MultiValueMap.class));
        assertEquals(2, result.path("structuredContent").path("files").size());
        assertTrue(text(result).contains("It made 2 files"), text(result));
    }

    private static ResponseEntity<Resource> zip(String... namesAndContents) throws Exception {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream out = new java.util.zip.ZipOutputStream(bytes)) {
            for (int i = 0; i < namesAndContents.length; i += 2) {
                out.putNextEntry(new java.util.zip.ZipEntry(namesAndContents[i]));
                out.write(namesAndContents[i + 1].getBytes(StandardCharsets.UTF_8));
                out.closeEntry();
            }
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("application/zip"));
        Resource body =
                new ByteArrayResource(bytes.toByteArray()) {
                    @Override
                    public String getFilename() {
                        return "split.zip";
                    }
                };
        return ResponseEntity.ok().headers(headers).body(body);
    }

    private ObjectNode run(ArrayNode steps) throws Exception {
        return executor.executePipeline(
                automations.parseSteps(steps, context), args(steps), context);
    }

    private ObjectNode args(ArrayNode steps) {
        ObjectNode args = mapper.createObjectNode();
        args.set("steps", steps);
        args.put("file", Base64.getEncoder().encodeToString("IN".getBytes(StandardCharsets.UTF_8)));
        return args;
    }

    private ArrayNode steps(String... ids) {
        ArrayNode steps = mapper.createArrayNode();
        for (String id : ids) {
            steps.addObject().put("operation", id).putObject("parameters");
        }
        return steps;
    }

    private static OperationMeta op(String id, OperationCategory category, String path) {
        return new OperationMeta(
                id,
                category,
                id,
                new ObjectMapper().createObjectNode(),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                path,
                null);
    }

    private static PipelineStep step(String path) {
        return new PipelineStep(path, java.util.Map.of());
    }

    private static Policy policy(String id, String name, PipelineStep step) {
        return new Policy(
                id,
                name,
                "admin",
                true,
                List.of(),
                List.of(step),
                OutputSpec.inline(),
                List.of(),
                1L);
    }

    private static ResponseEntity<Resource> pdf(String content) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        Resource body =
                new ByteArrayResource(content.getBytes(StandardCharsets.UTF_8)) {
                    @Override
                    public String getFilename() {
                        return "out.pdf";
                    }
                };
        return ResponseEntity.ok().headers(headers).body(body);
    }

    private static String text(ObjectNode result) {
        return result.get("content").get(0).get("text").asText();
    }

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> provider(T bean) {
        ObjectProvider<T> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(bean);
        return provider;
    }
}
