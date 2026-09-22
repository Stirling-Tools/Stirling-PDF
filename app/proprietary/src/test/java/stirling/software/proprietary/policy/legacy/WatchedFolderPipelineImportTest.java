package stirling.software.proprietary.policy.legacy;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.dao.DataAccessResourceFailureException;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.proprietary.policy.config.FolderAccessDeniedException;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;
import stirling.software.proprietary.security.repository.TeamRepository;

import tools.jackson.databind.json.JsonMapper;

/** Tests for {@link WatchedFolderPipelineImport}. */
class WatchedFolderPipelineImportTest {

    @TempDir Path watchedRoot;

    private final PolicyStore policyStore = new InProcessPolicyStore();
    private final SourceStore sourceStore = new InProcessSourceStore();
    private final RecordingImportedPipelines importedPipelines = new RecordingImportedPipelines();
    private final RuntimePathConfig runtimePathConfig = mock(RuntimePathConfig.class);
    private final TeamRepository teamRepository = mock(TeamRepository.class);
    private final PolicyTriggerManager policyTriggerManager = mock(PolicyTriggerManager.class);
    private final FolderAccessGuard folderAccessGuard = mock(FolderAccessGuard.class);
    private final ToolMetadataService toolMetadataService = mock(ToolMetadataService.class);
    private final ApplicationProperties applicationProperties = new ApplicationProperties();

    private WatchedFolderPipelineImport importer;
    private String finishedFolders;

    @BeforeEach
    void setUp() {
        finishedFolders = watchedRoot.resolveSibling("finished").toString();
        when(runtimePathConfig.getPipelineWatchedFoldersPaths())
                .thenReturn(List.of(watchedRoot.toString()));
        when(runtimePathConfig.getPipelineFinishedFoldersPath()).thenReturn(finishedFolders);
        when(teamRepository.findByName(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(Optional.empty());
        importer = importerSavingTo(policyStore);
    }

    private WatchedFolderPipelineImport importerSavingTo(PolicyStore store) {
        return new WatchedFolderPipelineImport(
                new LegacyPipelineConverter(JsonMapper.builder().build(), runtimePathConfig),
                store,
                sourceStore,
                importedPipelines,
                policyTriggerManager,
                teamRepository,
                runtimePathConfig,
                folderAccessGuard,
                toolMetadataService,
                applicationProperties);
    }

    @Test
    void convertsAWatchedFolderIntoAnEnabledFolderWatchedPolicy() throws IOException {
        Path folder = watchedFolder("invoices");

        importer.importWatchedFolders();

        Policy policy = policyStore.all().get(0);
        assertEquals("Compress invoices", policy.name());
        assertTrue(policy.enabled(), "existing drop-folder automations must keep running");
        assertEquals(1, policy.inputs().size());

        PipelineInput input = policy.inputs().get(0);
        assertEquals("folder-watch", input.trigger().type());
        Source inputSource = sourceStore.get(input.sourceId()).orElseThrow();
        assertEquals("folder", inputSource.type());
        assertEquals(folder.toString(), inputSource.options().get("directory"));
        assertEquals(
                "consume",
                inputSource.options().get("mode"),
                "the legacy runner removed inputs once processed");

        assertEquals(1, policy.steps().size());
        assertEquals("/api/v1/misc/compress-pdf", policy.steps().get(0).operation());
        assertFalse(policy.steps().get(0).parameters().containsKey("fileInput"));
        // Marked so the list can say where it came from rather than passing it off as ours.
        assertEquals(Policy.ORIGIN_MIGRATED, policy.origin());
    }

    @Test
    void leavesTheOwnerUnsetSoTriggeredRunsHaveAnIdentityTheEngineAccepts() throws IOException {
        watchedFolder("invoices");

        importer.importWatchedFolders();

        // A placeholder here fails every run: the owner becomes the audit principal, whose API
        // key the tool dispatch then looks up.
        assertNull(policyStore.all().get(0).owner());
        assertTrue(sourceStore.all().stream().allMatch(source -> source.owner() == null));
    }

    @Test
    void pointsThePolicyAtTheDestinationTheLegacyConfigWroteTo() throws IOException {
        watchedFolder("invoices");

        importer.importWatchedFolders();

        Policy policy = policyStore.all().get(0);
        assertEquals(1, policy.outputIds().size());
        Source destination = sourceStore.get(policy.outputIds().get(0)).orElseThrow();
        assertEquals(Path.of(finishedFolders).toString(), destination.options().get("directory"));
        assertEquals("compressed_{filename}", destination.options().get("filenamePattern"));
    }

    @Test
    void movesTheConfigOutOfThePipelineFolder() throws IOException {
        Path folder = watchedFolder("invoices");

        importer.importWatchedFolders();

        assertFalse(
                Files.exists(folder.resolve("config.json")),
                "left in place, the new input source would hand the config to the pipeline");
        assertTrue(
                Files.exists(
                        folder.resolve(".stirling").resolve("migrated").resolve("config.json")));
    }

    @Test
    void reportsAConvertedFolderSoTheLegacyScannerStandsDown() throws IOException {
        Path folder = watchedFolder("invoices");
        assertFalse(importer.isMigrated(folder));

        importer.importWatchedFolders();

        assertTrue(importer.isMigrated(folder));
        assertFalse(importer.isMigrated(watchedRoot.resolve("untouched")));
    }

    @Test
    void convertsEachFolderOnlyOnceEvenAfterThePolicyIsDeleted() throws IOException {
        watchedFolder("invoices");
        importer.importWatchedFolders();
        policyStore.delete(policyStore.all().get(0).id());

        importer.importWatchedFolders();

        assertTrue(policyStore.all().isEmpty(), "a deleted conversion must stay deleted");
    }

    @Test
    void findsPipelineFoldersNestedBelowTheRootAndSkipsStagingDirectories() throws IOException {
        watchedFolder("team/invoices");
        Path staging = watchedRoot.resolve("team/invoices/processing");
        Files.createDirectories(staging);
        Files.writeString(staging.resolve("stale.json"), "{}");

        importer.importWatchedFolders();

        assertEquals(1, policyStore.all().size());
    }

    @Test
    void ignoresAFolderWithNoConfig() throws IOException {
        Files.createDirectories(watchedRoot.resolve("empty"));

        importer.importWatchedFolders();

        assertTrue(policyStore.all().isEmpty());
        assertFalse(importer.isMigrated(watchedRoot.resolve("empty")));
    }

    @Test
    void leavesAFolderAloneWhenItsOutputDirectoryIsNotPermitted() throws IOException {
        Path folder = watchedFolderWritingTo("invoices", "/data/outbox");
        doThrow(new FolderAccessDeniedException("denied"))
                .when(folderAccessGuard)
                .requirePermitted(any());

        importer.importWatchedFolders();

        // The sink would refuse every delivery, so the legacy scanner has to keep the folder.
        assertTrue(policyStore.all().isEmpty());
        assertTrue(sourceStore.all().isEmpty());
        assertFalse(importer.isMigrated(folder));
        assertTrue(
                Files.exists(folder.resolve("config.json")),
                "the legacy scanner still needs its config");
    }

    @Test
    void neverFailsBootWhenTheTeamLookupBlowsUp() throws IOException {
        watchedFolder("invoices");
        when(teamRepository.findByName(org.mockito.ArgumentMatchers.anyString()))
                .thenThrow(new DataAccessResourceFailureException("db down"));

        // A ready-event listener that throws aborts SpringApplication.run.
        assertDoesNotThrow(() -> importer.importWatchedFolders());
        assertTrue(policyStore.all().isEmpty());
    }

    @Test
    void leavesABatchFolderToTheLegacyScanner() throws IOException {
        Path folder = batchWatchedFolder("invoices");

        importer.importWatchedFolders();

        // A policy would run merge once per file, which is not the automation being converted.
        assertTrue(policyStore.all().isEmpty());
        assertTrue(sourceStore.all().isEmpty());
        assertFalse(importer.isMigrated(folder));
        assertTrue(
                Files.exists(folder.resolve("config.json")),
                "the legacy scanner still needs its config");
    }

    @Test
    void convertsABatchFolderWhenTheOperatorOptsIn() throws IOException {
        Path folder = batchWatchedFolder("invoices");
        applicationProperties.getPolicies().setMigrateBatchWatchedFolders(true);

        importer.importWatchedFolders();

        assertEquals(1, policyStore.all().size());
        assertTrue(importer.isMigrated(folder));
    }

    @Test
    void archivesTheConfigBeforeThePolicyCanBeTriggered() throws IOException {
        Path folder = watchedFolder("invoices");
        PolicyStore assertingStore =
                new InProcessPolicyStore() {
                    @Override
                    public Policy save(Policy policy) {
                        assertFalse(
                                Files.exists(folder.resolve("config.json")),
                                "a saved policy is live, and the config is a claimable input");
                        return super.save(policy);
                    }
                };

        importerSavingTo(assertingStore).importWatchedFolders();

        assertEquals(1, assertingStore.all().size());
    }

    @Test
    void putsTheConfigBackWhenSavingThePolicyFails() throws IOException {
        Path folder = watchedFolder("invoices");
        PolicyStore failingStore =
                new InProcessPolicyStore() {
                    @Override
                    public Policy save(Policy policy) {
                        throw new DataAccessResourceFailureException("db down");
                    }
                };

        assertDoesNotThrow(() -> importerSavingTo(failingStore).importWatchedFolders());

        assertTrue(
                Files.exists(folder.resolve("config.json")),
                "an aborted conversion must leave the folder running on the legacy scanner");
        assertFalse(
                Files.exists(
                        folder.resolve(".stirling").resolve("migrated").resolve("config.json")));
        assertFalse(importer.isMigrated(folder));
    }

    @Test
    void keepsTheImportMarkerWithinThePrimaryKeyLength() throws IOException {
        String deep = "a".repeat(80) + "/" + "b".repeat(80) + "/" + "c".repeat(80);
        Path folder = watchedFolder(deep + "/invoices");

        importer.importWatchedFolders();

        // An oversized key fails the insert, and the folder is then converted on every boot.
        assertEquals(1, importedPipelines.keys.size());
        assertTrue(
                importedPipelines.keys.get(0).length() <= ImportedPipeline.MAX_KEY_LENGTH,
                importedPipelines.keys.get(0));
        assertTrue(importer.isMigrated(folder));
    }

    /** A legacy watched folder: a pipeline JSON beside the files it processes. */
    private Path watchedFolder(String relative) throws IOException {
        return watchedFolderWritingTo(relative, "{outputFolder}");
    }

    @Test
    void theRealFolderGuardPermitsTheDeliveryPathEveryConversionUses() throws IOException {
        Path folder = watchedFolder("invoices");
        WatchedFolderPipelineImport guarded =
                new WatchedFolderPipelineImport(
                        new LegacyPipelineConverter(
                                JsonMapper.builder().build(), runtimePathConfig),
                        policyStore,
                        sourceStore,
                        importedPipelines,
                        policyTriggerManager,
                        teamRepository,
                        runtimePathConfig,
                        new FolderAccessGuard(
                                applicationProperties,
                                runtimePathConfig,
                                new StandardEnvironment(),
                                sourceStore),
                        toolMetadataService,
                        applicationProperties);

        guarded.importWatchedFolders();

        // No admin allowlists the finished-folders directory, so it has to be implied.
        assertEquals(1, policyStore.all().size());
        assertTrue(guarded.isMigrated(folder));
    }

    /** A legacy watched folder whose pipeline merges every ready file into one document. */
    private Path batchWatchedFolder(String relative) throws IOException {
        when(toolMetadataService.isMultiInput("/api/v1/general/merge-pdfs")).thenReturn(true);
        Path folder = watchedRoot.resolve(relative);
        Files.createDirectories(folder);
        Files.writeString(
                folder.resolve("config.json"),
                """
                {
                  "name": "Merge invoices",
                  "pipeline": [
                    {
                      "operation": "/api/v1/general/merge-pdfs",
                      "parameters": {"fileInput": "automated"}
                    }
                  ],
                  "outputDir": "{outputFolder}"
                }
                """);
        return folder;
    }

    private Path watchedFolderWritingTo(String relative, String outputDir) throws IOException {
        Path folder = watchedRoot.resolve(relative);
        Files.createDirectories(folder);
        Files.writeString(
                folder.resolve("config.json"),
                """
                {
                  "name": "Compress invoices",
                  "pipeline": [
                    {
                      "operation": "/api/v1/misc/compress-pdf",
                      "parameters": {"optimizeLevel": 3, "fileInput": "automated"}
                    }
                  ],
                  "outputDir": "%s",
                  "outputFileName": "compressed_{filename}"
                }
                """
                        .formatted(outputDir));
        return folder;
    }

    /** Keeps the markers written so their shape can be asserted. */
    private static class RecordingImportedPipelines extends InProcessImportedPipelines {

        private final List<String> keys = new ArrayList<>();

        @Override
        public void markImported(String key) {
            keys.add(key);
            super.markImported(key);
        }
    }
}
