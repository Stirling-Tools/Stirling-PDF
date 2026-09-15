package stirling.software.proprietary.policy.input;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.ledger.StorageFileIdentities;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.output.OutputDelivery;
import stirling.software.proprietary.policy.output.StorageOutputSink;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.storage.service.FileStorageService;
import stirling.software.proprietary.storage.service.StorageCleanupQueue;

class StorageProcessingVersionTest {

    private static final String USERNAME = "owner@example.com";

    private final StoredFileRepository files = mock(StoredFileRepository.class);
    private final FolderRepository folders = mock(FolderRepository.class);
    private final StorageProvider blobs = mock(StorageProvider.class);
    private final ResolveContext context = mock(ResolveContext.class);
    private final UserService userService = mock(UserService.class);
    private final ApplicationProperties properties = new ApplicationProperties();
    private final UUID folderId = UUID.randomUUID();
    private final User owner = new User();

    @BeforeEach
    void setUp() throws IOException {
        properties.getSecurity().setEnableLogin(true);
        properties.getStorage().setEnabled(true);
        owner.setId(7L);
        owner.setUsername(USERNAME);
        Folder folder = new Folder();
        folder.setOwner(owner);
        when(userService.getCurrentUsername()).thenReturn(USERNAME);
        when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(owner));
        when(folders.findByIdAndOwner(folderId, owner)).thenReturn(Optional.of(folder));
        when(blobs.load(anyString()))
                .thenAnswer(call -> new ByteArrayResource(call.<String>getArgument(0).getBytes()));
        when(context.claim(anyString(), anyString(), any()))
                .thenAnswer(
                        call -> {
                            call.<Supplier<String>>getArgument(2).get();
                            return true;
                        });
    }

    @Test
    void oldRunCannotReplaceANewerUpload() throws IOException {
        StoredFile original = file(2);
        ResolvedInput work = resolve(original);
        StoredFile newer = file(3);
        when(files.findById(1L)).thenReturn(Optional.of(newer));
        when(files.bumpContentVersionIfMatches(1L, 2L)).thenReturn(0);
        FileStorageService storage =
                new FileStorageService(
                        files,
                        folders,
                        mock(FileShareRepository.class),
                        mock(FileShareAccessRepository.class),
                        mock(UserRepository.class),
                        properties,
                        blobs,
                        Optional.empty(),
                        mock(StorageCleanupQueue.class));

        assertThatThrownBy(() -> deliver(work, storage))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        verify(files).bumpContentVersionIfMatches(1L, 2L);
        verify(blobs, never()).store(any(), any());
        verify(blobs, never()).delete(anyString());
        verify(files, never()).save(any());
        assertThat(newer.getStorageKey()).isEqualTo("version-3");
        work.onComplete().accept(false);
        verify(context)
                .settle(
                        eq("storage:1"),
                        eq(StorageFileIdentities.gate(original)),
                        anyString(),
                        eq(false));
    }

    @Test
    void replacementUsesTheRevisionCapturedAtDiscovery() throws IOException {
        ResolvedInput work = resolve(file(2));
        StoredFile current = file(2);
        when(files.findById(1L)).thenReturn(Optional.of(current));
        StoredFile output = file(3);
        FileStorageService storage = mock(FileStorageService.class);
        when(storage.replaceFile(eq(owner), eq(current), any(), isNull(), isNull(), eq(2L)))
                .thenReturn(output);

        deliver(work, storage);
        work.onComplete().accept(true);

        verify(context)
                .settle(
                        eq("storage:1"),
                        eq(StorageFileIdentities.gate(output)),
                        anyString(),
                        eq(true));
    }

    @Test
    void uploadAfterReplacementIsNotMarkedProcessed() throws IOException {
        ResolvedInput work = resolve(file(2));
        StoredFile current = file(2);
        when(files.findById(1L)).thenReturn(Optional.of(current));
        FileStorageService storage = mock(FileStorageService.class);
        StoredFile output = file(3);
        when(storage.replaceFile(eq(owner), eq(current), any(), isNull(), isNull(), eq(2L)))
                .thenReturn(output);
        deliver(work, storage);

        when(files.findById(1L)).thenReturn(Optional.of(file(4)));
        work.onComplete().accept(true);

        verify(context)
                .settle(
                        eq("storage:1"),
                        eq(StorageFileIdentities.gate(output)),
                        anyString(),
                        eq(true));
        verify(context, never())
                .settle(
                        eq("storage:1"),
                        eq(StorageFileIdentities.gate(file(4))),
                        any(),
                        any(Boolean.class));
    }

    @Test
    void completionWithoutReplacementOnlySettlesTheInputRevision() throws IOException {
        StoredFile original = file(2);
        ResolvedInput work = resolve(original);
        when(files.findById(1L)).thenReturn(Optional.of(file(3)));

        work.onComplete().accept(true);

        verify(context)
                .settle(
                        eq("storage:1"),
                        eq(StorageFileIdentities.gate(original)),
                        anyString(),
                        eq(true));
        verify(files, never()).findById(any());
    }

    @Test
    void deletingTheInputDoesNotRecreateItAsANewOutput() throws IOException {
        ResolvedInput work = resolve(file(2));
        FileStorageService storage = mock(FileStorageService.class);
        when(files.findById(1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> deliver(work, storage))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        verifyNoInteractions(storage);
    }

    private ResolvedInput resolve(StoredFile file) throws IOException {
        when(files.findAllByFolderIdAndOwner(folderId, owner)).thenReturn(List.of(file));
        when(files.findByIdAndOwner(1L, owner)).thenReturn(Optional.of(file));
        return new StorageFolderInputSource(files, folders, blobs, properties, userService)
                .resolve(
                        new InputSpec("storage-folder", Map.of("folderId", folderId.toString())),
                        context)
                .getFirst();
    }

    private void deliver(ResolvedInput work, FileStorageService storage) throws IOException {
        new StorageOutputSink(
                        files,
                        folders,
                        storage,
                        mock(ProcessedLedger.class),
                        blobs,
                        properties,
                        userService)
                .deliver(
                        new OutputDelivery("run", "policy", work.inputs(), USERNAME),
                        List.of(new ByteArrayResource("processed PDF".getBytes())),
                        new OutputSpec("storage", Map.of("mode", "new_version")));
    }

    private StoredFile file(long version) {
        StoredFile file = new StoredFile();
        file.setId(1L);
        file.setOwner(owner);
        file.setStorageKey("version-" + version);
        file.setContentVersion(version);
        file.setOriginalFilename("invoice.pdf");
        file.setSizeBytes(10L);
        file.setUpdatedAt(LocalDateTime.of(2026, 9, 15, 10, 0).plusSeconds(version));
        return file;
    }
}
