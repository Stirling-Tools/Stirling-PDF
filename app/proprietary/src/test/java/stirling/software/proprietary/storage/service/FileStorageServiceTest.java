package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.crypto.StorageEncryptionException;
import stirling.software.proprietary.storage.crypto.StorageKeyRevokedException;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.FileShareAccess;
import stirling.software.proprietary.storage.model.FileShareAccessType;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.model.WorkflowSession;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FileStorageServiceTest {

    @Mock private StoredFileRepository storedFileRepository;
    @Mock private FileShareRepository fileShareRepository;
    @Mock private FileShareAccessRepository fileShareAccessRepository;
    @Mock private UserRepository userRepository;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private StorageProvider storageProvider;
    @Mock private StorageCleanupQueue storageCleanupQueue;

    @Mock private ApplicationProperties.Security securityProperties;
    @Mock private ApplicationProperties.System systemProperties;
    @Mock private ApplicationProperties.Storage storageProperties;
    @Mock private ApplicationProperties.Storage.Sharing sharingProperties;
    @Mock private ApplicationProperties.Storage.Quotas quotasProperties;

    private FileStorageService service;

    @BeforeEach
    void setUp() {
        service =
                new FileStorageService(
                        storedFileRepository,
                        fileShareRepository,
                        fileShareAccessRepository,
                        userRepository,
                        applicationProperties,
                        storageProvider,
                        Optional.empty(),
                        storageCleanupQueue);

        // Default: storage and sharing fully enabled, share links enabled, no expiry
        when(applicationProperties.getSecurity()).thenReturn(securityProperties);
        when(securityProperties.isEnableLogin()).thenReturn(true);
        when(applicationProperties.getStorage()).thenReturn(storageProperties);
        when(storageProperties.isEnabled()).thenReturn(true);
        when(storageProperties.getSharing()).thenReturn(sharingProperties);
        when(sharingProperties.isEnabled()).thenReturn(true);
        when(sharingProperties.isLinkEnabled()).thenReturn(true);
        when(sharingProperties.getLinkExpirationDays()).thenReturn(0);
        when(applicationProperties.getSystem()).thenReturn(systemProperties);
        when(systemProperties.getFrontendUrl()).thenReturn("http://localhost:8080");
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private User user(long id) {
        User u = new User();
        u.setId(id);
        u.setUsername("user" + id);
        return u;
    }

    private StoredFile ownedFile(User owner) {
        StoredFile f = new StoredFile();
        f.setId(100L);
        f.setOwner(owner);
        f.setOriginalFilename("test.pdf");
        return f;
    }

    private FileShare shareFor(StoredFile file, User user, ShareAccessRole role) {
        FileShare s = legacyShareFor(file, user, role);
        s.setWriteEnabled(role == ShareAccessRole.EDITOR);
        return s;
    }

    /** A share as it exists after upgrading: role set, write never explicitly granted. */
    private FileShare legacyShareFor(StoredFile file, User user, ShareAccessRole role) {
        FileShare s = new FileShare();
        s.setFile(file);
        s.setSharedWithUser(user);
        s.setAccessRole(role);
        return s;
    }

    /** The service reads the acting principal off the security context to attribute writes. */
    private void withAuthenticatedUser(User user, Runnable action) {
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(user, "n/a", List.of()));
        try {
            action.run();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    // -------------------------------------------------------------------------
    // getAccessibleFile
    // -------------------------------------------------------------------------

    @Test
    void getAccessibleFile_owner_returnsFile() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(storedFileRepository.findByIdWithShares(100L)).thenReturn(Optional.of(f));

        assertThat(service.getAccessibleFile(owner, 100L)).isSameAs(f);
    }

    @Test
    void getAccessibleFile_sharedUser_returnsFile() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile f = ownedFile(owner);
        f.getShares().add(shareFor(f, requester, ShareAccessRole.VIEWER));
        when(storedFileRepository.findByIdWithShares(100L)).thenReturn(Optional.of(f));

        assertThat(service.getAccessibleFile(requester, 100L)).isSameAs(f);
    }

    @Test
    void getAccessibleFile_noAccess_throwsForbidden() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile f = ownedFile(owner);
        when(storedFileRepository.findByIdWithShares(100L)).thenReturn(Optional.of(f));

        assertThatThrownBy(() -> service.getAccessibleFile(requester, 100L))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    @Test
    void getAccessibleFile_fileNotFound_throwsNotFound() {
        User owner = user(1L);
        when(storedFileRepository.findByIdWithShares(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getAccessibleFile(owner, 999L))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(404);
    }

    // -------------------------------------------------------------------------
    // requireEditorAccess
    // -------------------------------------------------------------------------

    @Test
    void requireEditorAccess_owner_passes() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        service.requireEditorAccess(owner, f);
    }

    @Test
    void requireEditorAccess_editorShare_passes() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile f = ownedFile(owner);
        FileShare share = shareFor(f, requester, ShareAccessRole.EDITOR);
        when(fileShareRepository.findByFileAndSharedWithUser(f, requester))
                .thenReturn(Optional.of(share));

        service.requireEditorAccess(requester, f);
    }

    @Test
    void requireEditorAccess_viewerShare_throwsForbidden() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile f = ownedFile(owner);
        FileShare share = shareFor(f, requester, ShareAccessRole.VIEWER);
        when(fileShareRepository.findByFileAndSharedWithUser(f, requester))
                .thenReturn(Optional.of(share));

        assertThatThrownBy(() -> service.requireEditorAccess(requester, f))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    @Test
    void requireEditorAccess_noShare_throwsForbidden() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile f = ownedFile(owner);
        when(fileShareRepository.findByFileAndSharedWithUser(f, requester))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.requireEditorAccess(requester, f))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    // -------------------------------------------------------------------------
    // requireReadAccess
    // -------------------------------------------------------------------------

    @Test
    void requireReadAccess_owner_passes() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        service.requireReadAccess(owner, f);
    }

    @Test
    void requireReadAccess_viewerShare_passes() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile f = ownedFile(owner);
        FileShare share = shareFor(f, requester, ShareAccessRole.VIEWER);
        when(fileShareRepository.findByFileAndSharedWithUser(f, requester))
                .thenReturn(Optional.of(share));

        service.requireReadAccess(requester, f);
    }

    // -------------------------------------------------------------------------
    // shareWithUser
    // -------------------------------------------------------------------------

    @Test
    void shareWithUser_newShare_created() {
        User owner = user(1L);
        User target = user(2L);
        StoredFile f = ownedFile(owner);
        when(userRepository.findByUsernameIgnoreCase("user2")).thenReturn(Optional.of(target));
        when(fileShareRepository.findByFileAndSharedWithUser(f, target))
                .thenReturn(Optional.empty());
        when(fileShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FileShare result = service.shareWithUser(owner, f, "user2", ShareAccessRole.VIEWER);

        assertThat(result.getSharedWithUser()).isEqualTo(target);
        assertThat(result.getAccessRole()).isEqualTo(ShareAccessRole.VIEWER);
        verify(fileShareRepository).save(any(FileShare.class));
    }

    @Test
    void shareWithUser_existingShare_updatesRole() {
        User owner = user(1L);
        User target = user(2L);
        StoredFile f = ownedFile(owner);
        FileShare existing = shareFor(f, target, ShareAccessRole.VIEWER);
        when(userRepository.findByUsernameIgnoreCase("user2")).thenReturn(Optional.of(target));
        when(fileShareRepository.findByFileAndSharedWithUser(f, target))
                .thenReturn(Optional.of(existing));
        when(fileShareRepository.save(existing)).thenReturn(existing);

        service.shareWithUser(owner, f, "user2", ShareAccessRole.EDITOR);

        assertThat(existing.getAccessRole()).isEqualTo(ShareAccessRole.EDITOR);
        verify(fileShareRepository).save(existing);
    }

    @Test
    void shareWithUser_selfShare_throwsBadRequest() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(userRepository.findByUsernameIgnoreCase("user1")).thenReturn(Optional.of(owner));

        assertThatThrownBy(() -> service.shareWithUser(owner, f, "user1", ShareAccessRole.VIEWER))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(400);
    }

    @Test
    void shareWithUser_nonOwner_throwsForbidden() {
        User owner = user(1L);
        User nonOwner = user(2L);
        StoredFile f = ownedFile(owner);

        assertThatThrownBy(
                        () -> service.shareWithUser(nonOwner, f, "user1", ShareAccessRole.VIEWER))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    // -------------------------------------------------------------------------
    // revokeUserShare
    // -------------------------------------------------------------------------

    @Test
    void revokeUserShare_owner_removesShare() {
        User owner = user(1L);
        User target = user(2L);
        StoredFile f = ownedFile(owner);
        FileShare share = shareFor(f, target, ShareAccessRole.VIEWER);
        when(userRepository.findByUsernameIgnoreCase("user2")).thenReturn(Optional.of(target));
        when(fileShareRepository.findByFileAndSharedWithUser(f, target))
                .thenReturn(Optional.of(share));

        service.revokeUserShare(owner, f, "user2");

        verify(fileShareRepository).delete(share);
    }

    @Test
    void revokeUserShare_shareNotFound_silentSuccess() {
        User owner = user(1L);
        User target = user(2L);
        StoredFile f = ownedFile(owner);
        when(userRepository.findByUsernameIgnoreCase("user2")).thenReturn(Optional.of(target));
        when(fileShareRepository.findByFileAndSharedWithUser(f, target))
                .thenReturn(Optional.empty());

        service.revokeUserShare(owner, f, "user2");

        verify(fileShareRepository, never()).delete(any());
    }

    @Test
    void revokeUserShare_nonOwner_throwsForbidden() {
        User owner = user(1L);
        User nonOwner = user(2L);
        StoredFile f = ownedFile(owner);

        assertThatThrownBy(() -> service.revokeUserShare(nonOwner, f, "user2"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    // -------------------------------------------------------------------------
    // createShareLink
    // -------------------------------------------------------------------------

    @Test
    void createShareLink_owner_tokenGenerated() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(fileShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FileShare result = service.createShareLink(owner, f, ShareAccessRole.VIEWER);

        assertThat(result.getShareToken()).isNotNull();
        assertThat(result.getAccessRole()).isEqualTo(ShareAccessRole.VIEWER);
        verify(fileShareRepository).save(any(FileShare.class));
    }

    @Test
    void createShareLink_nonOwner_throwsForbidden() {
        User owner = user(1L);
        User nonOwner = user(2L);
        StoredFile f = ownedFile(owner);

        assertThatThrownBy(() -> service.createShareLink(nonOwner, f, ShareAccessRole.VIEWER))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    // -------------------------------------------------------------------------
    // revokeShareLink
    // -------------------------------------------------------------------------

    @Test
    void revokeShareLink_owner_validToken_deletesShareAndAccessRecords() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        FileShare share = shareFor(f, null, ShareAccessRole.VIEWER);
        share.setShareToken("test-token");
        when(fileShareRepository.findByShareToken("test-token")).thenReturn(Optional.of(share));

        service.revokeShareLink(owner, f, "test-token");

        verify(fileShareAccessRepository).deleteByFileShare(share);
        verify(fileShareRepository).delete(share);
    }

    @Test
    void revokeShareLink_tokenBelongsToOtherFile_throwsForbidden() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        f.setId(1L);
        StoredFile otherFile = ownedFile(owner);
        otherFile.setId(2L);
        FileShare share = shareFor(otherFile, null, ShareAccessRole.VIEWER);
        share.setShareToken("token");
        when(fileShareRepository.findByShareToken("token")).thenReturn(Optional.of(share));

        assertThatThrownBy(() -> service.revokeShareLink(owner, f, "token"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    @Test
    void revokeShareLink_tokenNotFound_throwsNotFound() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(fileShareRepository.findByShareToken("unknown")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.revokeShareLink(owner, f, "unknown"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(404);
    }

    // -------------------------------------------------------------------------
    // Storage quota enforcement (via storeFile / replaceFile public API)
    // -------------------------------------------------------------------------

    @Test
    void storeFile_nullQuotas_passes() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});
        when(storageProvider.store(any(), any()))
                .thenReturn(
                        StoredObject.builder()
                                .storageKey("k")
                                .originalFilename("test.pdf")
                                .contentType("application/pdf")
                                .sizeBytes(1L)
                                .build());
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.storeFile(owner, file);

        verify(storageProvider).store(owner, file);
    }

    @Test
    void storeFile_fileTooLarge_throwsPayloadTooLarge() {
        when(storageProperties.getQuotas()).thenReturn(quotasProperties);
        when(quotasProperties.getMaxFileMb()).thenReturn(1L); // 1 MB limit
        when(quotasProperties.getMaxStorageMbPerUser()).thenReturn(-1L);
        when(quotasProperties.getMaxStorageMbTotal()).thenReturn(-1L);
        User owner = user(1L);
        // 2 MB file exceeds the 1 MB limit
        MockMultipartFile file =
                new MockMultipartFile(
                        "file", "big.pdf", "application/pdf", new byte[2 * 1024 * 1024]);

        assertThatThrownBy(() -> service.storeFile(owner, file))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(413);
    }

    @Test
    void storeFile_perUserQuotaExceeded_throwsPayloadTooLarge() {
        when(storageProperties.getQuotas()).thenReturn(quotasProperties);
        when(quotasProperties.getMaxFileMb()).thenReturn(-1L);
        when(quotasProperties.getMaxStorageMbPerUser()).thenReturn(10L); // 10 MB per-user cap
        when(quotasProperties.getMaxStorageMbTotal()).thenReturn(-1L);
        User owner = user(1L);
        // user already has 9 MB stored; a 2 MB upload pushes to 11 MB > 10 MB cap
        when(storedFileRepository.sumStorageBytesByOwner(owner)).thenReturn(9L * 1024 * 1024);
        MockMultipartFile file =
                new MockMultipartFile(
                        "file", "f.pdf", "application/pdf", new byte[2 * 1024 * 1024]);

        assertThatThrownBy(() -> service.storeFile(owner, file))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(413);
    }

    @Test
    void storeFile_globalQuotaExceeded_throwsPayloadTooLarge() {
        when(storageProperties.getQuotas()).thenReturn(quotasProperties);
        when(quotasProperties.getMaxFileMb()).thenReturn(-1L);
        when(quotasProperties.getMaxStorageMbPerUser()).thenReturn(-1L);
        when(quotasProperties.getMaxStorageMbTotal()).thenReturn(100L); // 100 MB global cap
        User owner = user(1L);
        // system already has 99 MB; a 2 MB upload pushes to 101 MB > 100 MB cap
        when(storedFileRepository.sumStorageBytesTotal()).thenReturn(99L * 1024 * 1024);
        MockMultipartFile file =
                new MockMultipartFile(
                        "file", "f.pdf", "application/pdf", new byte[2 * 1024 * 1024]);

        assertThatThrownBy(() -> service.storeFile(owner, file))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(413);
    }

    @Test
    void replaceFile_replacementShrinks_skipsPerUserAndGlobalCheck() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(quotasProperties);
        when(quotasProperties.getMaxFileMb()).thenReturn(-1L);
        User owner = user(1L);
        // existing file is 5 MB; replacement is 1 MB → delta ≤ 0 → quota repos never queried
        StoredFile existing = ownedFile(owner);
        existing.setSizeBytes(5L * 1024 * 1024);
        existing.setStorageKey("old-key");
        MockMultipartFile newFile =
                new MockMultipartFile(
                        "file", "small.pdf", "application/pdf", new byte[1 * 1024 * 1024]);
        when(storageProvider.store(any(), any()))
                .thenReturn(
                        StoredObject.builder()
                                .storageKey("new-key")
                                .originalFilename("small.pdf")
                                .contentType("application/pdf")
                                .sizeBytes(1L * 1024 * 1024)
                                .build());
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.replaceFile(owner, existing, newFile);

        verify(storedFileRepository, never()).sumStorageBytesByOwner(any());
        verify(storedFileRepository, never()).sumStorageBytesTotal();
    }

    // replaceFile - collaborative editor write-back

    private StoredObject storedObject(String key) {
        return StoredObject.builder()
                .storageKey(key)
                .originalFilename("test.pdf")
                .contentType("application/pdf")
                .sizeBytes(1L)
                .build();
    }

    @Test
    void replaceFile_editorShare_nonOwnerCanWrite() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        User editor = user(2L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        FileShare share = shareFor(existing, editor, ShareAccessRole.EDITOR);
        when(fileShareRepository.findByFileAndSharedWithUser(existing, editor))
                .thenReturn(Optional.of(share));
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        service.replaceFile(editor, existing, file, null, null);

        // Blob attribution stays with the file owner, not the acting editor.
        verify(storageProvider).store(owner, file);
    }

    @Test
    void updateFileResponse_editorShare_recordsEditAccess() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        User editor = user(2L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        FileShare share = shareFor(existing, editor, ShareAccessRole.EDITOR);
        existing.getShares().add(share);
        when(storedFileRepository.findByIdWithShares(100L)).thenReturn(Optional.of(existing));
        when(fileShareRepository.findByFileAndSharedWithUser(existing, editor))
                .thenReturn(Optional.of(share));
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        withAuthenticatedUser(editor, () -> service.updateFileResponse(editor, 100L, file));

        ArgumentCaptor<FileShareAccess> access = ArgumentCaptor.forClass(FileShareAccess.class);
        verify(fileShareAccessRepository).save(access.capture());
        assertThat(access.getValue().getAccessType()).isEqualTo(FileShareAccessType.EDIT);
        assertThat(access.getValue().getFileShare()).isSameAs(share);
        assertThat(access.getValue().getUser()).isSameAs(editor);
    }

    @Test
    void updateFileResponse_owner_recordsNoShareAccess() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        when(storedFileRepository.findByIdWithShares(100L)).thenReturn(Optional.of(existing));
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        withAuthenticatedUser(owner, () -> service.updateFileResponse(owner, 100L, file));

        verify(fileShareAccessRepository, never()).save(any());
    }

    @Test
    void replaceFile_viewerShare_nonOwnerForbidden() {
        User owner = user(1L);
        User viewer = user(2L);
        StoredFile existing = ownedFile(owner);
        FileShare share = shareFor(existing, viewer, ShareAccessRole.VIEWER);
        when(fileShareRepository.findByFileAndSharedWithUser(existing, viewer))
                .thenReturn(Optional.of(share));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFile(viewer, existing, file, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    @Test
    void replaceFile_nonOwner_sharingDisabled_forbidden() {
        when(sharingProperties.isEnabled()).thenReturn(false);
        User owner = user(1L);
        User editor = user(2L);
        StoredFile existing = ownedFile(owner);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFile(editor, existing, file, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    @Test
    void replaceFile_versionMismatch_throwsConflict() {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setContentVersion(5L);
        when(storedFileRepository.bumpContentVersionIfMatches(100L, 4L)).thenReturn(0);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFile(owner, existing, file, null, null, 4L))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(409);
        verify(storedFileRepository, never()).save(any());
    }

    @Test
    void replaceFile_versionMatch_bumpsAndSaves() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setContentVersion(4L);
        existing.setStorageKey("old-key");
        when(storedFileRepository.bumpContentVersionIfMatches(100L, 4L)).thenReturn(1);
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        StoredFile updated = service.replaceFile(owner, existing, file, null, null, 4L);

        assertThat(updated.getContentVersion()).isEqualTo(5L);
    }

    @Test
    void replaceFile_noExpectedVersion_bumpsUnconditionally() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        // Another writer bumped past us, so the SQL-computed value is not loaded + 1.
        when(storedFileRepository.findContentVersionById(100L)).thenReturn(9L);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        StoredFile updated = service.replaceFile(owner, existing, file, null, null, null);

        verify(storedFileRepository).bumpContentVersion(100L);
        assertThat(updated.getContentVersion()).isEqualTo(9L);
    }

    @Test
    void replaceFile_noExpectedVersion_versionProjectionMissing_fallsBackToLoadedPlusOne()
            throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(storedFileRepository.findContentVersionById(100L)).thenReturn(null);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        StoredFile updated = service.replaceFile(owner, existing, file, null, null, null);

        // Legacy null version reads as 0 and increments to 1.
        assertThat(updated.getContentVersion()).isEqualTo(1L);
    }

    @Test
    void replaceFileViaShareLink_editorRole_writes() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        FileShare linkShare = new FileShare();
        linkShare.setFile(existing);
        linkShare.setShareToken("token-1");
        linkShare.setAccessRole(ShareAccessRole.EDITOR);
        linkShare.setWriteEnabled(true);
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        StoredFile updated = service.replaceFileViaShareLink(linkShare, file, null, null, null);

        assertThat(updated.getStorageKey()).isEqualTo("new-key");
        verify(storageProvider).store(owner, file);
    }

    @Test
    void replaceFileViaShareLink_viewerRole_forbidden() {
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        FileShare linkShare = new FileShare();
        linkShare.setFile(existing);
        linkShare.setShareToken("token-1");
        linkShare.setAccessRole(ShareAccessRole.VIEWER);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFileViaShareLink(linkShare, file, null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
    }

    // replaceFile - write is opt-in per share

    @Test
    void replaceFile_legacyEditorShare_withoutExplicitWriteGrant_forbidden() {
        User owner = user(1L);
        User editor = user(2L);
        StoredFile existing = ownedFile(owner);
        FileShare share = legacyShareFor(existing, editor, ShareAccessRole.EDITOR);
        when(fileShareRepository.findByFileAndSharedWithUser(existing, editor))
                .thenReturn(Optional.of(share));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFile(editor, existing, file, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
        verify(storedFileRepository, never()).save(any());
    }

    @Test
    void replaceFileViaShareLink_legacyEditorLink_withoutExplicitWriteGrant_forbidden() {
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        FileShare linkShare = new FileShare();
        linkShare.setFile(existing);
        linkShare.setShareToken("token-1");
        linkShare.setAccessRole(ShareAccessRole.EDITOR);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFileViaShareLink(linkShare, file, null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
        verify(storedFileRepository, never()).save(any());
    }

    @Test
    void shareWithUser_editorRole_grantsWriteExplicitly() {
        User owner = user(1L);
        User target = user(2L);
        StoredFile file = ownedFile(owner);
        when(storedFileRepository.findByIdAndOwnerWithShares(100L, owner))
                .thenReturn(Optional.of(file));
        when(userRepository.findByUsernameIgnoreCase("user2")).thenReturn(Optional.of(target));
        when(fileShareRepository.findByFileAndSharedWithUser(file, target))
                .thenReturn(Optional.empty());
        when(fileShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FileShare created = service.shareWithUser(owner, file, "user2", ShareAccessRole.EDITOR);

        assertThat(created.getWriteEnabled()).isTrue();
    }

    @Test
    void shareWithUser_viewerRole_doesNotGrantWrite() {
        User owner = user(1L);
        User target = user(2L);
        StoredFile file = ownedFile(owner);
        when(storedFileRepository.findByIdAndOwnerWithShares(100L, owner))
                .thenReturn(Optional.of(file));
        when(userRepository.findByUsernameIgnoreCase("user2")).thenReturn(Optional.of(target));
        when(fileShareRepository.findByFileAndSharedWithUser(file, target))
                .thenReturn(Optional.empty());
        when(fileShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FileShare created = service.shareWithUser(owner, file, "user2", ShareAccessRole.VIEWER);

        assertThat(created.getWriteEnabled()).isFalse();
    }

    // replaceFile - only the owner may replace history / audit artifacts

    @Test
    void replaceFile_editorShare_cannotReplaceHistoryBundle() {
        User owner = user(1L);
        User editor = user(2L);
        StoredFile existing = ownedFile(owner);
        existing.setHistoryStorageKey("owner-history");
        FileShare share = shareFor(existing, editor, ShareAccessRole.EDITOR);
        when(fileShareRepository.findByFileAndSharedWithUser(existing, editor))
                .thenReturn(Optional.of(share));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});
        MockMultipartFile history =
                new MockMultipartFile("historyBundle", "h.zip", "application/zip", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFile(editor, existing, file, history, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
        // The owner's archive must survive an editor attempting to overwrite it.
        assertThat(existing.getHistoryStorageKey()).isEqualTo("owner-history");
        verifyNoInteractions(storageProvider);
    }

    @Test
    void replaceFile_editorShare_cannotReplaceAuditLog() {
        User owner = user(1L);
        User editor = user(2L);
        StoredFile existing = ownedFile(owner);
        existing.setAuditLogStorageKey("owner-audit");
        FileShare share = shareFor(existing, editor, ShareAccessRole.EDITOR);
        when(fileShareRepository.findByFileAndSharedWithUser(existing, editor))
                .thenReturn(Optional.of(share));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});
        MockMultipartFile audit =
                new MockMultipartFile("auditLog", "a.json", "application/json", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFile(editor, existing, file, null, audit))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
        assertThat(existing.getAuditLogStorageKey()).isEqualTo("owner-audit");
        verifyNoInteractions(storageProvider);
    }

    @Test
    void replaceFileViaShareLink_cannotReplaceHistoryBundle() {
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setHistoryStorageKey("owner-history");
        FileShare linkShare = new FileShare();
        linkShare.setFile(existing);
        linkShare.setShareToken("token-1");
        linkShare.setAccessRole(ShareAccessRole.EDITOR);
        linkShare.setWriteEnabled(true);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});
        MockMultipartFile history =
                new MockMultipartFile("historyBundle", "h.zip", "application/zip", new byte[] {1});

        assertThatThrownBy(
                        () -> service.replaceFileViaShareLink(linkShare, file, history, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(403);
        assertThat(existing.getHistoryStorageKey()).isEqualTo("owner-history");
    }

    @Test
    void replaceFile_owner_mayStillReplaceHistoryBundle() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        existing.setHistoryStorageKey("old-history");
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});
        MockMultipartFile history =
                new MockMultipartFile("historyBundle", "h.zip", "application/zip", new byte[] {1});

        assertThatCode(() -> service.replaceFile(owner, existing, file, history, null))
                .doesNotThrowAnyException();
    }

    // replaceFile - the superseded blob outlives the transaction

    @Test
    void replaceFile_previousBlobIsDeletedOnlyAfterCommit() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        TransactionSynchronizationManager.initSynchronization();
        try {
            service.replaceFile(owner, existing, file, null, null);
            // Still uncommitted: a rollback here would restore the row pointing at old-key.
            verify(storageProvider, never()).delete("old-key");

            TransactionSynchronizationUtils.triggerAfterCommit();
            verify(storageProvider).delete("old-key");
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void replaceFile_previousBlobSurvivesWhenTheTransactionRollsBack() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        TransactionSynchronizationManager.initSynchronization();
        try {
            service.replaceFile(owner, existing, file, null, null);
            TransactionSynchronizationUtils.triggerAfterCompletion(
                    TransactionSynchronization.STATUS_ROLLED_BACK);

            verify(storageProvider, never()).delete("old-key");
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    // replaceFile - a rejected write must not destroy the previous blob

    @Test
    void replaceFile_versionMismatch_leavesPreviousBlobIntact() {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        StoredFile existing = ownedFile(owner);
        existing.setContentVersion(5L);
        existing.setStorageKey("old-key");
        when(storedFileRepository.bumpContentVersionIfMatches(100L, 4L)).thenReturn(0);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFile(owner, existing, file, null, null, 4L))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(409);
        assertThat(existing.getStorageKey()).isEqualTo("old-key");
        verifyNoInteractions(storageProvider);
    }

    @Test
    void replaceFile_editorShare_quotaChargedToOwner() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(quotasProperties);
        when(quotasProperties.getMaxFileMb()).thenReturn(-1L);
        when(quotasProperties.getMaxStorageMbPerUser()).thenReturn(10L);
        when(quotasProperties.getMaxStorageMbTotal()).thenReturn(-1L);
        User owner = user(1L);
        User editor = user(2L);
        StoredFile existing = ownedFile(owner);
        existing.setStorageKey("old-key");
        FileShare share = shareFor(existing, editor, ShareAccessRole.EDITOR);
        when(fileShareRepository.findByFileAndSharedWithUser(existing, editor))
                .thenReturn(Optional.of(share));
        when(storedFileRepository.sumStorageBytesByOwner(any())).thenReturn(0L);
        when(storageProvider.store(any(), any())).thenReturn(storedObject("new-key"));
        when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[1024 * 1024]);

        service.replaceFile(editor, existing, file, null, null);

        verify(storedFileRepository).sumStorageBytesByOwner(owner);
        verify(storedFileRepository, never()).sumStorageBytesByOwner(editor);
    }

    // -------------------------------------------------------------------------
    // deleteFile — workflow guard
    // -------------------------------------------------------------------------

    @Test
    void deleteFile_fileInActiveWorkflow_throwsBadRequest() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        WorkflowSession session = mock(WorkflowSession.class);
        when(session.isActive()).thenReturn(true);
        f.setWorkflowSession(session);

        assertThatThrownBy(() -> service.deleteFile(owner, f))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(400);

        verify(storedFileRepository, never()).delete(any());
    }

    @Test
    void deleteFile_fileNotInAnyWorkflow_deletesSuccessfully() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        // no workflow session set
        when(fileShareRepository.findShareLinks(f)).thenReturn(List.of());

        service.deleteFile(owner, f);

        verify(storedFileRepository).delete(f);
    }

    @Test
    void deleteFile_fileInCompletedWorkflow_deletesSuccessfully() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        WorkflowSession session = mock(WorkflowSession.class);
        when(session.isActive()).thenReturn(false);
        f.setWorkflowSession(session);
        when(fileShareRepository.findShareLinks(f)).thenReturn(List.of());

        service.deleteFile(owner, f);

        verify(storedFileRepository).delete(f);
    }

    // -------------------------------------------------------------------------
    // loadFile — encryption error mapping
    // -------------------------------------------------------------------------

    @Test
    void loadFile_revokedKey_throwsForbidden() throws IOException {
        StoredFile f = ownedFile(user(1L));
        f.setStorageKey("k");
        when(storageProvider.load("k"))
                .thenThrow(new StorageKeyRevokedException("Encryption key X is disabled"));

        assertThatThrownBy(() -> service.loadFile(f))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode())
                                        .isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void loadFile_genericIoError_throwsInternalServerError() throws IOException {
        StoredFile f = ownedFile(user(1L));
        f.setStorageKey("k");
        when(storageProvider.load("k")).thenThrow(new StorageEncryptionException("corrupt blob"));

        assertThatThrownBy(() -> service.loadFile(f))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode())
                                        .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR));
    }
}
