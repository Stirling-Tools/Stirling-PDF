package stirling.software.proprietary.policy.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.StorageFolderInputSource;
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
        lenient().when(folderRepository.findById(FOLDER_ID)).thenReturn(Optional.of(folder));
        lenient().when(folderRepository.existsById(FOLDER_ID)).thenReturn(true);
        lenient().when(userService.getCurrentUsername()).thenReturn("reece");
        lenient().when(policyManagementAuthority.currentUserTeamId()).thenReturn(3L);
        lenient()
                .when(policyRunner.run(any()))
                .thenReturn(new SweepOutcome(List.of("run-1"), 1, 0, 0, 0));

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
                        sourceStore);
        controller =
                new ProcessingFolderController(
                        policyStore,
                        sourceStore,
                        validator,
                        policyRunner,
                        policyTriggerManager,
                        processedLedger,
                        folderRepository,
                        fileStorageService,
                        accessGuard,
                        folderAccessGuard);
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
        assertThat(stored.sourceIds()).hasSize(1);
        var source = sourceStore.get(stored.sourceIds().get(0)).orElseThrow();
        assertThat(source.type()).isEqualTo("storage-folder");
        assertThat(source.options()).containsEntry("folderId", FOLDER_ID.toString());
        verify(policyRunner).run(stored);
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
        assertThat(stored.trigger()).isNotNull();
        assertThat(stored.trigger().type()).isEqualTo("folder-watch");
        var source = sourceStore.get(stored.sourceIds().get(0)).orElseThrow();
        assertThat(source.type()).isEqualTo("folder");
        // Never "consume": the directory is the user's own and must stay intact.
        assertThat(source.options()).containsEntry("mode", "track");
        assertThat(source.options()).containsEntry("limit", 100);
    }

    @Test
    void aStorageFolderStaysManualUntilTheArrivalTriggerExists() {
        var view = controller.save(request(null, "new_version")).getBody();

        assertThat(policyStore.get(view.id()).orElseThrow().trigger()).isNull();
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
                        null,
                        List.of(),
                        List.of(),
                        stirling.software.proprietary.policy.model.OutputSpec.inline(),
                        3L));

        assertThat(controller.list()).hasSize(1);
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
