package stirling.software.proprietary.policy.output;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.input.StoredFileBacked;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.ledger.StorageFileIdentities;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.storage.service.FileStorageService;

@ExtendWith(MockitoExtension.class)
class StorageOutputSinkTest {
    @Mock private StoredFileRepository files;
    @Mock private FolderRepository folders;
    @Mock private FileStorageService storage;
    @Mock private UserService users;
    private StorageOutputSink sink;
    private final UUID folderId = UUID.randomUUID();
    private final User owner = user(1L, "source-owner");
    private final ByteArrayResource output = new ByteArrayResource(new byte[] {1, 2, 3});

    @BeforeEach
    void setUp() {
        sink =
                new StorageOutputSink(
                        files,
                        folders,
                        storage,
                        mock(ProcessedLedger.class),
                        mock(StorageProvider.class),
                        new ApplicationProperties(),
                        users);
    }

    @Test
    void storesDiskOutputsAsTheResolvedSourceOwner() throws Exception {
        when(users.findByUsername("source-owner")).thenReturn(Optional.of(owner));
        Folder folder = folder(owner);
        when(folders.findById(folderId)).thenReturn(Optional.of(folder));
        when(folders.getReferenceById(folderId)).thenReturn(folder);
        StoredFile stored = stored(owner);
        when(storage.storeFile(eq(owner), any())).thenReturn(stored);
        when(files.save(stored)).thenReturn(stored);

        var results = sink.deliver(delivery("source-owner", false), List.of(output), destination());

        assertThat(results).hasSize(1);
        verify(storage).storeFile(eq(owner), any());
        assertThat(stored.getFolder()).isSameAs(folder);
    }

    @Test
    void refusesToWriteIntoAnotherUsersFolder() {
        when(users.findByUsername("source-owner")).thenReturn(Optional.of(owner));
        when(folders.findById(folderId))
                .thenReturn(Optional.of(folder(user(2L, "pipeline-owner"))));

        assertThatThrownBy(
                        () ->
                                sink.deliver(
                                        delivery("source-owner", false),
                                        List.of(output),
                                        destination()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("output folder");
        verifyNoInteractions(storage);
    }

    @Test
    void refusesToReplaceAnotherUsersInput() {
        when(users.findByUsername("source-owner")).thenReturn(Optional.of(owner));
        when(files.findById(10L)).thenReturn(Optional.of(stored(user(2L, "other-user"))));

        assertThatThrownBy(
                        () ->
                                sink.deliver(
                                        delivery("source-owner", true),
                                        List.of(output),
                                        new OutputSpec("storage", Map.of())))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("input file");
        verifyNoInteractions(storage);
    }

    @Test
    void versionsTheOwnersStoredInputWithoutChangingOwnership() throws Exception {
        when(users.findByUsername("source-owner")).thenReturn(Optional.of(owner));
        StoredFile origin = stored(owner);
        StoredInput input = new StoredInput();
        when(files.findById(10L)).thenReturn(Optional.of(origin));
        when(storage.replaceFile(
                        eq(owner),
                        eq(origin),
                        any(),
                        isNull(),
                        isNull(),
                        eq(StoredInput.VERSION)))
                .thenReturn(origin);

        sink.deliver(
                new OutputDelivery("run", null, PolicyInputs.of(List.of(input)), "source-owner"),
                List.of(output),
                new OutputSpec("storage", Map.of()));

        verify(storage)
                .replaceFile(
                        eq(owner),
                        eq(origin),
                        any(),
                        isNull(),
                        isNull(),
                        eq(StoredInput.VERSION));
        assertThat(origin.getOwner()).isSameAs(owner);
        // Completion must settle at what this run produced, not at whatever the row holds later.
        assertThat(input.recordedGate).isEqualTo(StorageFileIdentities.gate(origin));
    }

    @Test
    void doesNotSubstituteTheDestinationOwnerWhenTheRunOwnerIsMissing() {
        for (String username : new String[] {null, "", "deleted-user"}) {
            assertThatThrownBy(
                            () ->
                                    sink.deliver(
                                            delivery(username, false),
                                            List.of(output),
                                            destination()))
                    .isInstanceOf(IllegalStateException.class);
        }
        verifyNoInteractions(storage, folders);
    }

    private OutputDelivery delivery(String username, boolean storedInput) {
        return new OutputDelivery(
                "run",
                null,
                PolicyInputs.of(storedInput ? List.of(new StoredInput()) : List.of(output)),
                username);
    }

    private OutputSpec destination() {
        return new OutputSpec(
                "storage", Map.of("folderId", folderId.toString(), "mode", "new_file"));
    }

    private Folder folder(User owner) {
        Folder folder = new Folder();
        folder.setId(folderId);
        folder.setOwner(owner);
        return folder;
    }

    private static StoredFile stored(User owner) {
        StoredFile file = new StoredFile();
        file.setId(10L);
        file.setOwner(owner);
        file.setOriginalFilename("document.pdf");
        file.setSizeBytes(3L);
        return file;
    }

    private static User user(long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }

    private static class StoredInput extends ByteArrayResource implements StoredFileBacked {
        private static final long VERSION = 4L;

        private String recordedGate;

        private StoredInput() {
            super(new byte[] {1});
        }

        @Override
        public Long storedFileId() {
            return 10L;
        }

        @Override
        public long storedFileVersion() {
            return VERSION;
        }

        @Override
        public void recordReplacement(String gate, String contentHash) {
            recordedGate = gate;
        }
    }
}
