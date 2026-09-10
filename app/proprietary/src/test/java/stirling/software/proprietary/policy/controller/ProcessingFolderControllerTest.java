package stirling.software.proprietary.policy.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.engine.SweepKind;
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.StorageFolderInputSource;
import stirling.software.proprietary.policy.ledger.ClaimState;
import stirling.software.proprietary.policy.ledger.ProcessedFileStatus;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.output.StorageOutputSink;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTrigger;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.storage.service.FileStorageService;

/**
 * Tests for {@link ProcessingFolderController}: the source + policy pair composes and tears down
 * together, an invalid pipeline rolls the pair back, only the caller's own folders qualify, and the
 * records stay invisible to the policies surface.
 */
@ExtendWith(MockitoExtension.class)
class ProcessingFolderControllerTest {

    private static final UUID FOLDER_ID = UUID.randomUUID();

    @TempDir Path tempDir;

    @Mock private PolicyRunner policyRunner;
    @Mock private PolicyTriggerManager policyTriggerManager;
    @Mock private ProcessedLedger processedLedger;
    @Mock private FolderRepository folderRepository;
    @Mock private FileStorageService fileStorageService;
    @Mock private StoredFileRepository storedFileRepository;
    @Mock private StorageProvider storageProvider;
    @Mock private UserServiceInterface userService;
    @Mock private PolicyManagementAuthority policyManagementAuthority;
    @Mock private FolderAccessGuard folderAccessGuard;
    @Mock private PolicyTrigger folderWatchTrigger;
    @Mock private InputSource diskFolderSource;
    @Mock private stirling.software.proprietary.policy.asset.PolicyAssetStore assetStore;
    @Mock private stirling.software.common.service.ToolChainValidator toolChainValidator;
    @Mock private PolicyOutputSink diskFolderSink;

    private final InProcessPolicyStore policyStore = new InProcessPolicyStore();
    private final InProcessSourceStore sourceStore = new InProcessSourceStore();

    private User user;
    private Folder folder;
    private ProcessingFolderController controller;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(true);
        properties.getStorage().setEnabled(true);

        user = new User();
        user.setId(7L);
        user.setUsername("reece");
        folder = new Folder();
        folder.setId(FOLDER_ID);
        folder.setName("Contracts");
        folder.setOwner(user);

        lenient().when(fileStorageService.requireAuthenticatedUser()).thenReturn(user);
        // A disk-backed folder creates a storage folder to deliver its results into, then looks it
        // up again on the next save. The double has to remember what it stored for that second
        // lookup to find anything — otherwise every save mints a fresh folder.
        Map<UUID, Folder> folders = new HashMap<>();
        folders.put(FOLDER_ID, folder);
        lenient()
                .when(folderRepository.saveAndFlush(any(Folder.class)))
                .thenAnswer(
                        invocation -> {
                            Folder saved = invocation.getArgument(0);
                            folders.put(saved.getId(), saved);
                            return saved;
                        });
        lenient()
                .when(folderRepository.findById(any(UUID.class)))
                .thenAnswer(
                        invocation -> Optional.ofNullable(folders.get(invocation.getArgument(0))));
        lenient()
                .when(folderRepository.existsById(any(UUID.class)))
                .thenAnswer(invocation -> folders.containsKey(invocation.getArgument(0)));
        lenient().when(userService.getCurrentUsername()).thenReturn("reece");
        lenient().when(policyManagementAuthority.currentUserTeamId()).thenReturn(3L);
        lenient()
                .when(policyRunner.run(any(), any()))
                .thenReturn(new SweepOutcome(List.of("run-1"), 1, 0, 0, 0, 0));
        // Nothing runs in these tests, so per-file revert's quiet check passes.
        lenient().when(policyRunner.quiesced(any())).thenReturn(true);

        PolicyAccessGuard accessGuard =
                new PolicyAccessGuard(userService, properties, policyManagementAuthority);
        // The real FolderWatchTrigger is a bean; without one registered the validator reads
        // "folder-watch" as an unknown trigger type.
        lenient().when(folderWatchTrigger.type()).thenReturn("folder-watch");
        // Likewise the disk folder source and sink: real beans in the app, stubbed here so a
        // disk-backed folder validates without touching the filesystem.
        lenient().when(diskFolderSource.supports(any())).thenReturn(true);
        lenient().when(diskFolderSink.supports(any())).thenReturn(true);
        PolicyValidator validator =
                new PolicyValidator(
                        List.of(folderWatchTrigger),
                        List.of(
                                new StorageFolderInputSource(
                                        storedFileRepository,
                                        folderRepository,
                                        storageProvider,
                                        properties),
                                diskFolderSource),
                        List.of(
                                new StorageOutputSink(
                                        storedFileRepository,
                                        folderRepository,
                                        fileStorageService,
                                        processedLedger,
                                        storageProvider,
                                        properties),
                                diskFolderSink),
                        List.of(),
                        sourceStore,
                        assetStore,
                        toolChainValidator);
        controller =
                new ProcessingFolderController(
                        policyStore,
                        sourceStore,
                        validator,
                        policyRunner,
                        policyTriggerManager,
                        processedLedger,
                        folderRepository,
                        storedFileRepository,
                        fileStorageService,
                        accessGuard,
                        folderAccessGuard,
                        properties);
    }

    @Test
    void createComposesAValidatedPairAndSweepsTheBacklog() {
        var view = controller.save(request(null, "new_version")).getBody();

        assertThat(view.folderId()).isEqualTo(FOLDER_ID.toString());
        assertThat(view.enabled()).isTrue();
        Policy stored = policyStore.get(view.id()).orElseThrow();
        assertThat(ProcessingFolderController.isProcessingFolder(stored)).isTrue();
        assertThat(stored.owner()).isEqualTo("reece");
        assertThat(stored.teamId()).isEqualTo(3L);
        assertThat(stored.inputs()).hasSize(1);
        var source = sourceStore.get(stored.inputs().get(0).sourceId()).orElseThrow();
        assertThat(source.type()).isEqualTo("storage-folder");
        assertThat(source.options()).containsEntry("folderId", FOLDER_ID.toString());
        verify(policyRunner, timeout(2000)).run(stored, SweepKind.USER);
    }

    @Test
    void aForeignOutputFolderIdIsOverriddenWithTheOwnedSourceFolder() {
        // The caller owns FOLDER_ID but points output at someone else's folder.
        String foreign = "00000000-0000-0000-0000-0000000000ff";
        var view =
                controller
                        .save(
                                new ProcessingFolderController.SaveProcessingFolderRequest(
                                        null,
                                        FOLDER_ID.toString(),
                                        null,
                                        true,
                                        List.of(
                                                new PipelineStep(
                                                        "/api/v1/misc/flatten",
                                                        Map.of("flattenOnlyForms", false),
                                                        Map.of())),
                                        Map.of("mode", "new_file", "folderId", foreign)))
                        .getBody();

        Policy stored = policyStore.get(view.id()).orElseThrow();
        assertThat(stored.output().options())
                .containsEntry("folderId", FOLDER_ID.toString())
                .doesNotContainValue(foreign);
    }

    @Test
    void aCreateOverAnExistingPlaceAdoptsItWithoutReconfiguring() {
        var first = controller.save(request(null, "new_version")).getBody();
        Policy before = policyStore.get(first.id()).orElseThrow();

        var second =
                controller
                        .save(
                                new ProcessingFolderController.SaveProcessingFolderRequest(
                                        null,
                                        FOLDER_ID.toString(),
                                        null,
                                        false,
                                        List.of(),
                                        Map.of()))
                        .getBody();

        // Same record, untouched configuration.
        assertThat(second.id()).isEqualTo(first.id());
        Policy after = policyStore.get(first.id()).orElseThrow();
        assertThat(after.steps()).isEqualTo(before.steps());
        assertThat(after.enabled()).isEqualTo(before.enabled());
        verify(policyRunner, timeout(2000).times(2)).run(any(), any());
    }

    @Test
    void aDiskFolderIsWatchedSoArrivalsProcessThemselves() {
        var view =
                controller
                        .save(
                                new ProcessingFolderController.SaveProcessingFolderRequest(
                                        null,
                                        null,
                                        "/tmp/Downloads",
                                        true,
                                        List.of(
                                                new PipelineStep(
                                                        "/api/v1/misc/flatten",
                                                        Map.of("flattenOnlyForms", false),
                                                        Map.of())),
                                        Map.of()))
                        .getBody();

        Policy stored = policyStore.get(view.id()).orElseThrow();
        // Without a trigger the engine treats the policy as manual-only: the creating sweep would
        // run and the directory would never be processed again.
        assertThat(stored.inputs()).hasSize(1);
        assertThat(stored.inputs().get(0).trigger()).isNotNull();
        assertThat(stored.inputs().get(0).trigger().type()).isEqualTo("folder-watch");
        var source = sourceStore.get(stored.inputs().get(0).sourceId()).orElseThrow();
        assertThat(source.type()).isEqualTo("folder");
        // Never "consume": the directory is the user's own and must stay intact.
        assertThat(source.options()).containsEntry("mode", "track");
        assertThat(source.options()).containsEntry("limit", 100);
    }

    @Test
    void aDiskFolderProcessesInPlace() {
        var view =
                controller
                        .save(
                                new ProcessingFolderController.SaveProcessingFolderRequest(
                                        null,
                                        null,
                                        "/tmp/Downloads",
                                        true,
                                        List.of(
                                                new PipelineStep(
                                                        "/api/v1/misc/flatten",
                                                        Map.of("flattenOnlyForms", false),
                                                        Map.of())),
                                        Map.of()))
                        .getBody();

        Policy stored = policyStore.get(view.id()).orElseThrow();
        // Disk, not app storage: an install with no accounts and no file storage has nothing to
        // store a result against. Results replace the watched files in place.
        assertThat(stored.output().type()).isEqualTo("folder");
        assertThat(stored.output().options().get("directory")).isEqualTo("/tmp/Downloads");
        assertThat(stored.output().options().get("replace")).isEqualTo(true);
    }

    @Test
    void aDiskFolderReportsTheDirectoryItWatchesNotWhereResultsGo() {
        var view =
                controller
                        .save(
                                new ProcessingFolderController.SaveProcessingFolderRequest(
                                        null,
                                        null,
                                        "/tmp/Downloads",
                                        true,
                                        List.of(
                                                new PipelineStep(
                                                        "/api/v1/misc/flatten",
                                                        Map.of("flattenOnlyForms", false),
                                                        Map.of())),
                                        Map.of()))
                        .getBody();

        // The client shows this as the folder's address, so it has to be the watched directory —
        // reading it off the output made the folder advertise its own results subdirectory.
        assertThat(view.directory()).isEqualTo("/tmp/Downloads");
        assertThat(view.folderId()).isNull();
    }

    @Test
    void aStorageFolderStaysManualUntilTheArrivalTriggerExists() {
        var view = controller.save(request(null, "new_version")).getBody();

        assertThat(policyStore.get(view.id()).orElseThrow().inputs().get(0).trigger()).isNull();
    }

    @Test
    void anInvalidPipelineRollsBackTheSource() {
        assertThatThrownBy(() -> controller.save(request(null, "no_such_mode")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("mode");

        assertThat(sourceStore.all()).isEmpty();
        assertThat(policyStore.all()).isEmpty();
    }

    @Test
    void anotherUsersFolderReadsAsNotFound() {
        User stranger = new User();
        stranger.setId(8L);
        folder.setOwner(stranger);

        assertThatThrownBy(() -> controller.save(request(null, "new_version")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("No folder");
        assertThat(sourceStore.all()).isEmpty();
    }

    @Test
    void deleteTearsDownThePairAndItsHistory() {
        var view = controller.save(request(null, "new_version")).getBody();

        controller.delete(view.id());

        assertThat(policyStore.all()).isEmpty();
        assertThat(sourceStore.all()).isEmpty();
        verify(processedLedger).clearPolicy(view.id());
    }

    @Test
    void listShowsOnlyProcessingFolders() {
        controller.save(request(null, "new_version"));
        // An org policy in the same team is not a processing folder and stays invisible here.
        policyStore.save(
                new Policy(
                        null,
                        "Security Policy",
                        "reece",
                        true,
                        List.of(),
                        List.of(),
                        stirling.software.proprietary.policy.model.OutputSpec.inline(),
                        List.of(),
                        3L,
                        null));

        assertThat(controller.list()).hasSize(1);
    }

    @Test
    void aStorageFolderListsItsFilesWithTheirLedgerState() {
        var view = controller.save(request(null, "new_version")).getBody();
        StoredFile done = storedFile(11L, "done.pdf");
        StoredFile waiting = storedFile(12L, "waiting.pdf");
        when(storedFileRepository.findAllByFolderId(FOLDER_ID)).thenReturn(List.of(done, waiting));
        when(processedLedger.statesFor(eq(view.id()), any()))
                .thenReturn(
                        Map.of("storage:11", new ClaimState(ProcessedFileStatus.DONE, "g", null)));

        var files = controller.files(view.id());

        assertThat(files).hasSize(2);
        assertThat(files.get(0).name()).isEqualTo("done.pdf");
        assertThat(files.get(0).state()).isEqualTo("done");
        assertThat(files.get(1).state()).isEqualTo("waiting");
    }

    @Test
    void retryRunsOnlyTheNamedFile() {
        var view = controller.save(request(null, "new_version")).getBody();
        StoredFile doc = storedFile(11L, "doc.pdf");
        when(storedFileRepository.findAllByFolderId(FOLDER_ID)).thenReturn(List.of(doc));
        when(processedLedger.forgetFailure(view.id(), "storage:11")).thenReturn(true);

        controller.retryFile(view.id(), new ProcessingFolderController.RetryFileRequest("doc.pdf"));

        Policy stored = policyStore.get(view.id()).orElseThrow();
        // Scoped to the one file: a whole-folder sweep would also claim every file with no
        // ledger row, including an original a restore just brought back.
        verify(policyRunner).runFile(stored, "storage:11");
    }

    @Test
    void retryRefusesAFileWithNoParkedFailure() {
        var view = controller.save(request(null, "new_version")).getBody();
        StoredFile doc = storedFile(11L, "doc.pdf");
        when(storedFileRepository.findAllByFolderId(FOLDER_ID)).thenReturn(List.of(doc));
        when(processedLedger.forgetFailure(view.id(), "storage:11")).thenReturn(false);

        assertThatThrownBy(
                        () ->
                                controller.retryFile(
                                        view.id(),
                                        new ProcessingFolderController.RetryFileRequest("doc.pdf")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("no failure");
    }

    @Test
    void revertRestoresPausesAndForgetsSoTheFileReadsUnprocessed() throws Exception {
        lenient()
                .when(folderAccessGuard.requirePermitted(any(Path.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        var view = controller.save(diskRequest()).getBody();
        Files.writeString(tempDir.resolve("doc.pdf"), "processed");
        Path originals = tempDir.resolve(".stirling").resolve("originals");
        Files.createDirectories(originals);
        Files.writeString(originals.resolve("doc.pdf"), "original");

        var restored =
                controller.revertFile(
                        view.id(), new ProcessingFolderController.RevertFileRequest("doc.pdf"));

        assertThat(Files.readString(tempDir.resolve("doc.pdf"))).isEqualTo("original");
        assertThat(Files.exists(originals.resolve("doc.pdf"))).isFalse();
        assertThat(restored.state()).isEqualTo("waiting");
        // Forgotten, not settled: the file reads as unprocessed until the folder resumes.
        verify(processedLedger).forget(eq(view.id()), anyString());
        assertThat(policyStore.get(view.id()).orElseThrow().enabled()).isFalse();
    }

    @Test
    void revertRefusesAFileWithNoArchivedOriginal() throws Exception {
        lenient()
                .when(folderAccessGuard.requirePermitted(any(Path.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        var view = controller.save(diskRequest()).getBody();
        Files.writeString(tempDir.resolve("doc.pdf"), "processed");

        assertThatThrownBy(
                        () ->
                                controller.revertFile(
                                        view.id(),
                                        new ProcessingFolderController.RevertFileRequest(
                                                "doc.pdf")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("no original");
    }

    @Test
    void revertAllRestoresEveryArchivedOriginal() throws Exception {
        lenient()
                .when(folderAccessGuard.requirePermitted(any(Path.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        var view = controller.save(diskRequest()).getBody();
        Path originals = tempDir.resolve(".stirling").resolve("originals");
        Files.createDirectories(originals);
        for (String name : List.of("doc1.pdf", "doc2.pdf")) {
            Files.writeString(tempDir.resolve(name), "processed");
            Files.writeString(originals.resolve(name), "original");
        }

        var outcome = controller.revertAllFiles(view.id());

        assertThat(outcome.restored()).isEqualTo(2);
        assertThat(outcome.skipped()).isZero();
        assertThat(Files.readString(tempDir.resolve("doc1.pdf"))).isEqualTo("original");
        assertThat(Files.readString(tempDir.resolve("doc2.pdf"))).isEqualTo("original");
        assertThat(Files.exists(originals.resolve("doc1.pdf"))).isFalse();
        assertThat(policyStore.get(view.id()).orElseThrow().enabled()).isFalse();
        verify(policyRunner).cancelRuns(view.id());
        verify(policyRunner).awaitQuiesce(eq(view.id()), any());
        // Failed rows go too: the reset leaves every file reading as waiting.
        verify(processedLedger).clearPolicy(view.id());
    }

    @Test
    void revertAllIgnoresNestedArchivesSoItRestoresOnlyTheFolderSOwnFiles() throws Exception {
        lenient()
                .when(folderAccessGuard.requirePermitted(any(Path.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        var view = controller.save(diskRequest()).getBody();
        Path originals = tempDir.resolve(".stirling").resolve("originals");
        // The consumer half of the superseded layout: a same-name re-drop displaces the original
        // it replaces one level down, and revert-all must leave it there. Restoring it as a
        // sibling would leave the user a second "doc.pdf" their folder never held. The write half
        // - that only the canonical name ever lands in this namespace - is pinned by
        // FolderOutputSinkTest.aSupersededOriginalIsKeptOutOfTheRestoreNamespace.
        Path superseded = originals.resolve("superseded");
        Files.createDirectories(superseded);
        Files.writeString(tempDir.resolve("doc.pdf"), "processed");
        Files.writeString(originals.resolve("doc.pdf"), "the-original");
        Files.writeString(superseded.resolve("doc.pdf"), "displaced-original");

        var outcome = controller.revertAllFiles(view.id());

        assertThat(outcome.restored()).isEqualTo(1);
        assertThat(Files.readString(tempDir.resolve("doc.pdf"))).isEqualTo("the-original");
        try (Stream<Path> entries = Files.list(tempDir)) {
            assertThat(entries.filter(Files::isRegularFile).map(f -> f.getFileName().toString()))
                    .containsExactly("doc.pdf");
        }
        // Still preserved, just not restored over anything.
        assertThat(Files.readString(superseded.resolve("doc.pdf"))).isEqualTo("displaced-original");
    }

    @Test
    void revertAllWithNothingArchivedStillResetsTheFolder() throws Exception {
        lenient()
                .when(folderAccessGuard.requirePermitted(any(Path.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        var view = controller.save(diskRequest()).getBody();

        var outcome = controller.revertAllFiles(view.id());

        assertThat(outcome.restored()).isZero();
        assertThat(outcome.skipped()).isZero();
        // No files moved, but the reset still lands: paused, cancelled, history gone.
        assertThat(policyStore.get(view.id()).orElseThrow().enabled()).isFalse();
        verify(policyRunner).cancelRuns(view.id());
        verify(policyRunner).awaitQuiesce(eq(view.id()), any());
        verify(processedLedger).clearPolicy(view.id());
    }

    @Test
    void resumingAPausedFolderSweepsImmediately() {
        var view = controller.save(request(null, "new_version")).getBody();
        // Pause: no sweep. Resume: sweeps like creation, so waiting files catch up now
        // rather than at the next reconcile tick.
        controller.save(pausedCopy(view, false));
        controller.save(pausedCopy(view, true));

        // Both sweeps run behind their responses; the runs feed carries the progress.
        verify(policyRunner, timeout(2000).times(2)).run(any(Policy.class), eq(SweepKind.USER));
    }

    /** The stored record re-saved with only its enabled flag changed. */
    private ProcessingFolderController.SaveProcessingFolderRequest pausedCopy(
            ProcessingFolderController.ProcessingFolderView view, boolean enabled) {
        return new ProcessingFolderController.SaveProcessingFolderRequest(
                view.id(), view.folderId(), null, enabled, view.steps(), view.output());
    }

    @Test
    void aPausedCreateStillSweepsItsBacklog() {
        var view =
                controller
                        .save(
                                new ProcessingFolderController.SaveProcessingFolderRequest(
                                        null,
                                        null,
                                        "/tmp/Downloads",
                                        false,
                                        List.of(
                                                new PipelineStep(
                                                        "/api/v1/misc/flatten",
                                                        Map.of("flattenOnlyForms", false),
                                                        Map.of())),
                                        Map.of()))
                        .getBody();

        Policy stored = policyStore.get(view.id()).orElseThrow();
        assertThat(stored.enabled()).isFalse();
        // The pause lives on the policy alone: a disabled source is skipped by every sweep,
        // which would silently no-op the born-paused Downloads trick's own backlog sweep.
        var source = sourceStore.get(stored.inputs().get(0).sourceId()).orElseThrow();
        assertThat(source.enabled()).isTrue();
        verify(policyRunner, timeout(2000)).run(stored, SweepKind.USER);
    }

    /** A disk-backed folder over the test's own temp directory. */
    private ProcessingFolderController.SaveProcessingFolderRequest diskRequest() {
        return new ProcessingFolderController.SaveProcessingFolderRequest(
                null,
                null,
                tempDir.toString(),
                true,
                List.of(
                        new PipelineStep(
                                "/api/v1/misc/flatten",
                                Map.of("flattenOnlyForms", false),
                                Map.of())),
                Map.of());
    }

    @Test
    void cancelStopsTheFoldersRuns() {
        var view = controller.save(request(null, "new_version")).getBody();
        when(policyRunner.cancelRuns(view.id())).thenReturn(3);

        assertThat(controller.cancelRuns(view.id()).cancelled()).isEqualTo(3);
    }

    /** A stored file double with just what the listing reads. */
    private static StoredFile storedFile(long id, String name) {
        StoredFile file = mock(StoredFile.class);
        lenient().when(file.getId()).thenReturn(id);
        lenient().when(file.getOriginalFilename()).thenReturn(name);
        lenient().when(file.getSizeBytes()).thenReturn(100L);
        lenient().when(file.getUpdatedAt()).thenReturn(LocalDateTime.of(2026, 1, 1, 0, 0));
        return file;
    }

    private static ProcessingFolderController.SaveProcessingFolderRequest request(
            String id, String mode) {
        return new ProcessingFolderController.SaveProcessingFolderRequest(
                id,
                FOLDER_ID.toString(),
                null,
                true,
                List.of(
                        new PipelineStep(
                                "/api/v1/misc/flatten",
                                Map.of("flattenOnlyForms", false),
                                Map.of())),
                Map.of("mode", mode));
    }
}
