package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;
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
    @Mock private StorageCleanupEntryRepository storageCleanupEntryRepository;

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
                        storageCleanupEntryRepository);

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
        FileShare s = new FileShare();
        s.setFile(file);
        s.setSharedWithUser(user);
        s.setAccessRole(role);
        return s;
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
}
