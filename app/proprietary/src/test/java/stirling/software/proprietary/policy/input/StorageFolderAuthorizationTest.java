package stirling.software.proprietary.policy.input;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyEngine;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.source.InProcessSourceDocCounter;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceAccessGuard;
import stirling.software.proprietary.policy.source.SourceController;
import stirling.software.proprietary.policy.source.SourceOverviewService;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.model.FilePurpose;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

@ExtendWith(MockitoExtension.class)
class StorageFolderAuthorizationTest {

    @Mock private FolderRepository folderRepository;
    @Mock private StoredFileRepository fileRepository;
    @Mock private StorageProvider blobs;
    @Mock private UserService users;
    @Mock private PolicyManagementAuthority authority;
    @Mock private PolicyEngine engine;

    private final ApplicationProperties properties = new ApplicationProperties();
    private final InProcessSourceStore sources = new InProcessSourceStore();
    private final Map<UUID, Folder> folders = new HashMap<>();
    private final Map<Long, StoredFile> files = new HashMap<>();
    private User alice;
    private User bob;
    private Folder aliceFolder;
    private Folder bobFolder;
    private StorageFolderInputSource input;
    private SourceController controller;
    private PolicyRunner runner;

    @BeforeEach
    void setUp() throws IOException {
        properties.getSecurity().setEnableLogin(true);
        properties.getStorage().setEnabled(true);
        alice = user(1L, "alice");
        bob = user(2L, "bob");
        aliceFolder = folder(alice);
        bobFolder = folder(bob);
        file(1L, aliceFolder);
        file(2L, bobFolder);
        lenient().when(users.getCurrentUsername()).thenReturn("alice");
        lenient().when(users.findByUsername("alice")).thenReturn(Optional.of(alice));
        lenient().when(users.findByUsername("bob")).thenReturn(Optional.of(bob));
        lenient().when(users.usernameExists(anyString())).thenReturn(true);
        lenient().when(authority.canEditPolicies()).thenReturn(true);
        lenient().when(authority.currentUserTeamId()).thenReturn(1L);
        lenient()
                .when(folderRepository.findByIdAndOwner(any(), any()))
                .thenAnswer(
                        call ->
                                Optional.ofNullable(folders.get(call.getArgument(0)))
                                        .filter(
                                                folder ->
                                                        folder.getOwner() == call.getArgument(1)));
        lenient()
                .when(fileRepository.findAllByFolderIdAndOwner(any(), any()))
                .thenAnswer(
                        call ->
                                files.values().stream()
                                        .filter(
                                                file ->
                                                        file.getFolder()
                                                                .getId()
                                                                .equals(call.getArgument(0)))
                                        .filter(file -> file.getOwner() == call.getArgument(1))
                                        .toList());
        lenient()
                .when(fileRepository.findByIdAndOwner(any(), any()))
                .thenAnswer(
                        call ->
                                Optional.ofNullable(files.get(call.getArgument(0)))
                                        .filter(file -> file.getOwner() == call.getArgument(1)));
        lenient()
                .when(blobs.load(anyString()))
                .thenAnswer(
                        call ->
                                new ByteArrayResource(
                                        ((String) call.getArgument(0))
                                                .getBytes(StandardCharsets.UTF_8)));
        input =
                new StorageFolderInputSource(
                        fileRepository, folderRepository, blobs, properties, users);
        PolicyAccessGuard policies = new PolicyAccessGuard(users, properties, authority);
        controller =
                new SourceController(
                        sources,
                        new SourceAccessGuard(users, properties, authority),
                        mock(SourceOverviewService.class),
                        new InProcessPolicyStore(),
                        policies,
                        authority,
                        mock(PolicyTriggerManager.class),
                        properties,
                        List.of(input));
        runner =
                new PolicyRunner(
                        engine,
                        List.of(input),
                        sources,
                        new InProcessSourceDocCounter(),
                        new InProcessProcessedLedger(),
                        properties,
                        policies);
    }

    @Test
    void sourceCreationRejectsAnotherCustomersFolderEvenWithForgedOwnership() {
        Source request =
                new Source(
                        null,
                        "Input",
                        "storage-folder",
                        Map.of("folderId", bobFolder.getId().toString(), "owner", "bob"),
                        true,
                        "bob",
                        2L);

        ResponseStatusException error =
                assertThrows(ResponseStatusException.class, () -> controller.save(request));

        assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(sources.all()).isEmpty();
        verifyNoInteractions(fileRepository, blobs, engine);
    }

    @Test
    void aRejectedEditPreservesTheOriginalFolderBinding() {
        Source saved = controller.save(source(null, aliceFolder, null)).getBody();

        assertThrows(
                ResponseStatusException.class,
                () -> controller.save(source(saved.id(), bobFolder, null)));

        assertThat(sources.get(saved.id())).contains(saved);
        verifyNoInteractions(fileRepository, blobs, engine);
    }

    @Test
    void foreignAndMissingFoldersHaveTheSamePublicError() {
        ResponseStatusException foreign =
                assertThrows(
                        ResponseStatusException.class,
                        () -> controller.save(source(null, bobFolder, null)));
        folders.remove(bobFolder.getId());
        ResponseStatusException missing =
                assertThrows(
                        ResponseStatusException.class,
                        () -> controller.save(source(null, bobFolder, null)));

        assertThat(foreign.getStatusCode()).isEqualTo(missing.getStatusCode());
        assertThat(foreign.getReason()).isEqualTo(missing.getReason());
    }

    @Test
    void resolutionWithoutAPersistedPolicyOwnerFailsClosed() {
        assertThatThrownBy(
                        () ->
                                input.resolve(
                                        source(null, aliceFolder, "alice"),
                                        mock(ResolveContext.class),
                                        null))
                .isInstanceOf(IllegalArgumentException.class);

        verifyNoInteractions(fileRepository, blobs);
    }

    @Test
    void backgroundSweepRejectsAnAlreadyStoredForeignFolderBeforeProcessing() {
        Source stored = sources.save(source(null, bobFolder, "alice"));
        lenient().when(users.getCurrentUsername()).thenReturn(null);

        assertThat(runner.run(policy(stored, "alice")).runIds()).isEmpty();

        verifyNoInteractions(fileRepository, blobs, engine);
        verify(users, never()).getCurrentUsername();
    }

    @Test
    void aPolicyCannotBorrowAnotherOwnersPrivateSourceEvenInTheSameTeam() {
        Source stored = sources.save(source(null, bobFolder, "bob"));

        assertThat(runner.run(policy(stored, "alice")).runIds()).isEmpty();

        verifyNoInteractions(fileRepository, blobs, engine);
    }

    @Test
    void backgroundProcessingUsesStoredAuthorityInsteadOfTheRequestUser() throws IOException {
        Source stored = controller.save(source(null, aliceFolder, null)).getBody();
        lenient().when(users.getCurrentUsername()).thenReturn("bob");
        clearInvocations(users);
        when(engine.runPolicy(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PolicyRunHandle("run", new CompletableFuture<>()));

        assertThat(runner.run(policy(stored, "alice")).runIds()).containsExactly("run");
        verify(users, never()).getCurrentUsername();

        ArgumentCaptor<PolicyInputs> captured = ArgumentCaptor.forClass(PolicyInputs.class);
        verify(engine).runPolicy(any(), captured.capture(), any(), any(), any(), any());
        assertThat(captured.getValue().primary()).hasSize(1);
        try (var stream = captured.getValue().primary().getFirst().getInputStream()) {
            assertThat(new String(stream.readAllBytes(), StandardCharsets.UTF_8))
                    .isEqualTo("alice/1");
        }
    }

    @Test
    void filesOwnedBySomeoneElseAreExcludedEvenInsideAnOwnedFolder() throws IOException {
        files.get(2L).setFolder(aliceFolder);

        List<ResolvedInput> work = resolveOwned();

        assertThat(work).extracting(ResolvedInput::fileIdentity).containsExactly("storage:1");
    }

    @Test
    void changingFileOwnershipAfterDiscoveryPreventsOpeningItsContents() throws IOException {
        List<ResolvedInput> work = resolveOwned();
        files.get(1L).setOwner(bob);
        clearInvocations(blobs);

        assertThatThrownBy(() -> work.getFirst().inputs().primary().getFirst().getInputStream())
                .isInstanceOf(IllegalArgumentException.class);

        verifyNoInteractions(blobs);
    }

    @Test
    void changingFolderOwnershipAfterDiscoveryPreventsOpeningItsContents() throws IOException {
        List<ResolvedInput> work = resolveOwned();
        aliceFolder.setOwner(bob);
        clearInvocations(blobs);

        assertThatThrownBy(() -> work.getFirst().inputs().primary().getFirst().getInputStream())
                .isInstanceOf(IllegalArgumentException.class);

        verifyNoInteractions(blobs);
    }

    @Test
    void aFileReclassifiedAsAPrivateArtifactCannotBeOpened() throws IOException {
        List<ResolvedInput> work = resolveOwned();
        files.get(1L).setPurpose(FilePurpose.SIGNING_ORIGINAL);
        clearInvocations(blobs);

        assertThatThrownBy(() -> work.getFirst().inputs().primary().getFirst().getInputStream())
                .isInstanceOf(IllegalArgumentException.class);

        verifyNoInteractions(blobs);
    }

    @Test
    void completionDoesNotHashAFileThatNowBelongsToSomeoneElse() throws IOException {
        List<ResolvedInput> work = resolveOwned();
        files.get(1L).setOwner(bob);
        clearInvocations(blobs);

        work.getFirst().onComplete().accept(true);

        verifyNoInteractions(blobs);
    }

    @Test
    void disabledStorageAlsoRejectsExistingSourcesAtExecution() {
        Source stored = sources.save(source(null, aliceFolder, "alice"));
        properties.getStorage().setEnabled(false);

        assertThat(runner.run(policy(stored, "alice")).runIds()).isEmpty();

        verifyNoInteractions(fileRepository, blobs, engine);
    }

    private List<ResolvedInput> resolveOwned() throws IOException {
        ResolveContext context = mock(ResolveContext.class);
        when(context.claim(any(), any(), any())).thenReturn(true);
        return input.resolve(source(null, aliceFolder, "alice"), context, "alice");
    }

    private static Source source(String id, Folder folder, String owner) {
        return new Source(
                id,
                "Input",
                "storage-folder",
                Map.of("folderId", folder.getId().toString()),
                true,
                owner,
                1L);
    }

    private static Policy policy(Source source, String owner) {
        return new Policy(
                "policy",
                "Process",
                owner,
                true,
                List.of(new PipelineInput(source.id(), null)),
                List.of(),
                OutputSpec.inline(),
                1L);
    }

    private static User user(Long id, String name) {
        User user = new User();
        user.setId(id);
        user.setUsername(name);
        return user;
    }

    private Folder folder(User owner) {
        Folder folder = new Folder();
        folder.setId(UUID.randomUUID());
        folder.setOwner(owner);
        folders.put(folder.getId(), folder);
        return folder;
    }

    private void file(Long id, Folder folder) {
        StoredFile file = new StoredFile();
        file.setId(id);
        file.setFolder(folder);
        file.setOwner(folder.getOwner());
        file.setOriginalFilename("document.pdf");
        file.setStorageKey(folder.getOwner().getUsername() + "/" + id);
        file.setSizeBytes(7L);
        file.setUpdatedAt(LocalDateTime.of(2026, 9, 15, 12, 0));
        files.put(id, file);
    }
}
