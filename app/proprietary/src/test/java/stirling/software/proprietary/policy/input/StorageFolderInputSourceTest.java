package stirling.software.proprietary.policy.input;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.storage.model.FilePurpose;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Tests for {@link StorageFolderInputSource}: files are claimed once per content version, an
 * in-place output settles at its own post-run version instead of re-triggering, a genuine edit is
 * picked up again, and purpose-bound files are never ingested.
 */
@ExtendWith(MockitoExtension.class)
class StorageFolderInputSourceTest {

    private static final String POLICY = "p1";
    private static final UUID FOLDER = UUID.randomUUID();
    private static final LocalDateTime T1 = LocalDateTime.of(2026, 7, 1, 10, 0);
    private static final LocalDateTime T2 = LocalDateTime.of(2026, 7, 1, 10, 5);

    @Mock private StoredFileRepository storedFileRepository;
    @Mock private FolderRepository folderRepository;
    @Mock private StorageProvider storageProvider;

    private StorageFolderInputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        source =
                new StorageFolderInputSource(
                        storedFileRepository,
                        folderRepository,
                        storageProvider,
                        storageEnabledProperties());
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
    }

    @Test
    void claimsEachFileOncePerContentVersion() throws IOException {
        StoredFile file = storedFile(1L, "doc.pdf", T1);
        when(storedFileRepository.findAllByFolderId(FOLDER)).thenReturn(List.of(file));
        when(storedFileRepository.findById(1L)).thenReturn(Optional.of(file));

        List<ResolvedInput> work = source.resolve(spec(), ctx);

        assertEquals(1, work.size());
        assertEquals("doc.pdf", work.get(0).inputs().primary().get(0).getFilename());
        // In flight: a second sweep does not pick it up again.
        assertTrue(source.resolve(spec(), ctx).isEmpty());

        // Settled at an unchanged version: still nothing new to do.
        work.get(0).onComplete().accept(true);
        assertTrue(source.resolve(spec(), ctx).isEmpty());
    }

    @Test
    void anInPlaceOutputDoesNotRetriggerTheFolder() throws IOException {
        StoredFile file = storedFile(1L, "doc.pdf", T1);
        when(storedFileRepository.findAllByFolderId(FOLDER)).thenReturn(List.of(file));

        List<ResolvedInput> work = source.resolve(spec(), ctx);

        // The run replaces the file's content in place before completion fires.
        file.setUpdatedAt(T2);
        when(storedFileRepository.findById(1L)).thenReturn(Optional.of(file));
        work.get(0).onComplete().accept(true);

        // The next sweep sees the bumped version already settled — no self-feeding loop.
        assertTrue(source.resolve(spec(), ctx).isEmpty());
    }

    @Test
    void aGenuineEditIsPickedUpAgain() throws IOException {
        StoredFile file = storedFile(1L, "doc.pdf", T1);
        when(storedFileRepository.findAllByFolderId(FOLDER)).thenReturn(List.of(file));
        when(storedFileRepository.findById(1L)).thenReturn(Optional.of(file));

        source.resolve(spec(), ctx).get(0).onComplete().accept(true);

        // The user re-uploads: the gate changes and the file becomes fresh work.
        file.setUpdatedAt(T2);
        assertEquals(1, source.resolve(spec(), ctx).size());
    }

    @Test
    void purposeBoundFilesAreNeverIngested() throws IOException {
        StoredFile signing = storedFile(2L, "contract.pdf", T1);
        signing.setPurpose(FilePurpose.SIGNING_ORIGINAL);
        when(storedFileRepository.findAllByFolderId(FOLDER)).thenReturn(List.of(signing));

        assertTrue(source.resolve(spec(), ctx).isEmpty());
        assertTrue(ctx.present.isEmpty());
    }

    @Test
    void aFailedRunLeavesTheFileForItsNextVersion() throws IOException {
        StoredFile file = storedFile(1L, "doc.pdf", T1);
        when(storedFileRepository.findAllByFolderId(FOLDER)).thenReturn(List.of(file));
        when(storedFileRepository.findById(1L)).thenReturn(Optional.of(file));

        source.resolve(spec(), ctx).get(0).onComplete().accept(false);

        // Failed at this version: not retried until the content changes.
        assertTrue(source.resolve(spec(), ctx).isEmpty());
        file.setUpdatedAt(T2);
        assertEquals(1, source.resolve(spec(), ctx).size());
    }

    @Test
    void validateRejectsAnUnknownFolder() {
        when(folderRepository.existsById(FOLDER)).thenReturn(false);

        assertThrows(IllegalArgumentException.class, () -> source.validate(spec()));
    }

    @Test
    void validateRejectsAMissingFolderId() {
        assertThrows(
                IllegalArgumentException.class,
                () -> source.validate(new InputSpec("storage-folder", Map.of())));
    }

    @Test
    void validateRejectsWhenStorageIsDisabled() {
        StorageFolderInputSource disabled =
                new StorageFolderInputSource(
                        storedFileRepository,
                        folderRepository,
                        storageProvider,
                        new ApplicationProperties());

        assertThrows(IllegalArgumentException.class, () -> disabled.validate(spec()));
    }

    private static InputSpec spec() {
        return new InputSpec("storage-folder", Map.of("folderId", FOLDER.toString()));
    }

    private static StoredFile storedFile(Long id, String name, LocalDateTime updatedAt) {
        StoredFile file = new StoredFile();
        file.setId(id);
        file.setOriginalFilename(name);
        file.setStorageKey("key-" + id);
        file.setSizeBytes(100);
        file.setUpdatedAt(updatedAt);
        return file;
    }

    private static ApplicationProperties storageEnabledProperties() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(true);
        properties.getStorage().setEnabled(true);
        return properties;
    }

    private class RecordingContext implements ResolveContext {

        private final List<String> present = new ArrayList<>();

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(POLICY, identity, gate, contentHash);
        }

        @Override
        public void settle(
                String identity, String finalGate, String finalContentHash, boolean success) {
            ledger.settle(POLICY, identity, finalGate, finalContentHash, success);
        }

        @Override
        public boolean allSettledDone(String identity) {
            return ledger.allSettledDone(identity);
        }

        @Override
        public void reportPresent(Collection<String> identities) {
            present.addAll(identities);
        }
    }
}
