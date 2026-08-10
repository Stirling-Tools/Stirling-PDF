package stirling.software.proprietary.policy.legacy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.configuration.RuntimePathConfig;
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
    private final ImportedPipelines importedPipelines = new InProcessImportedPipelines();
    private final RuntimePathConfig runtimePathConfig = mock(RuntimePathConfig.class);
    private final TeamRepository teamRepository = mock(TeamRepository.class);
    private final PolicyTriggerManager policyTriggerManager = mock(PolicyTriggerManager.class);

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
        importer =
                new WatchedFolderPipelineImport(
                        new LegacyPipelineConverter(
                                JsonMapper.builder().build(), runtimePathConfig),
                        policyStore,
                        sourceStore,
                        importedPipelines,
                        policyTriggerManager,
                        teamRepository,
                        runtimePathConfig);
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

    /** A legacy watched folder: a pipeline JSON beside the files it processes. */
    private Path watchedFolder(String relative) throws IOException {
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
                  "outputDir": "{outputFolder}",
                  "outputFileName": "compressed_{filename}"
                }
                """);
        return folder;
    }
}
