package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FilePurpose;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.FileShareAccess;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.model.WorkflowSession;

// Covers gaps not exercised by FileStorageServiceTest: enabled-guards, share-link access,
// workflow helpers, and validation branches.
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FileStorageServiceMoreTest {

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

        when(applicationProperties.getSecurity()).thenReturn(securityProperties);
        when(securityProperties.isEnableLogin()).thenReturn(true);
        when(applicationProperties.getStorage()).thenReturn(storageProperties);
        when(storageProperties.isEnabled()).thenReturn(true);
        when(storageProperties.getSharing()).thenReturn(sharingProperties);
        when(sharingProperties.isEnabled()).thenReturn(true);
        when(sharingProperties.isLinkEnabled()).thenReturn(true);
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

    private Authentication authFor(User user) {
        return new UsernamePasswordAuthenticationToken(user, "n/a", List.of());
    }

    // -------------------------------------------------------------------------
    // ensureStorageEnabled / ensureSharingEnabled / ensureShareLinksEnabled
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("enabled guards")
    class EnabledGuards {

        @Test
        void ensureStorageEnabled_loginDisabled_throwsForbidden() {
            when(securityProperties.isEnableLogin()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureStorageEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(403);
        }

        @Test
        void ensureStorageEnabled_storageDisabled_throwsForbidden() {
            when(storageProperties.isEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureStorageEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(403);
        }

        @Test
        void ensureSharingEnabled_sharingDisabled_throwsForbidden() {
            when(sharingProperties.isEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureSharingEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(403);
        }

        @Test
        void ensureShareLinksEnabled_linksDisabled_throwsForbidden() {
            when(sharingProperties.isLinkEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureShareLinksEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(403);
        }
    }

    // -------------------------------------------------------------------------
    // requireAuthenticatedUser
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("requireAuthenticatedUser")
    class RequireAuthenticatedUser {

        @Test
        void noAuthentication_throwsUnauthorized() {
            SecurityContextHolder.clearContext();

            assertThatThrownBy(() -> service.requireAuthenticatedUser())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(401);
        }

        @Test
        void userPrincipal_returnsUser() {
            User u = user(5L);
            SecurityContextHolder.getContext().setAuthentication(authFor(u));
            try {
                assertThat(service.requireAuthenticatedUser()).isSameAs(u);
            } finally {
                SecurityContextHolder.clearContext();
            }
        }

        @Test
        void nonUserPrincipal_throwsUnauthorized() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    "plainString", "n/a", List.of()));
            try {
                assertThatThrownBy(() -> service.requireAuthenticatedUser())
                        .isInstanceOf(ResponseStatusException.class)
                        .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                        .isEqualTo(401);
            } finally {
                SecurityContextHolder.clearContext();
            }
        }
    }

    // -------------------------------------------------------------------------
    // leaveUserShare
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("leaveUserShare")
    class LeaveUserShare {

        @Test
        void ownerCannotLeave_throwsForbidden() {
            User owner = user(1L);
            StoredFile f = ownedFile(owner);

            assertThatThrownBy(() -> service.leaveUserShare(owner, f))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(403);
        }

        @Test
        void shareNotFound_throwsNotFound() {
            User owner = user(1L);
            User requester = user(2L);
            StoredFile f = ownedFile(owner);
            when(fileShareRepository.findByFileAndSharedWithUser(f, requester))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.leaveUserShare(requester, f))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(404);
        }

        @Test
        void existingShare_deleted() {
            User owner = user(1L);
            User requester = user(2L);
            StoredFile f = ownedFile(owner);
            FileShare share = shareFor(f, requester, ShareAccessRole.VIEWER);
            when(fileShareRepository.findByFileAndSharedWithUser(f, requester))
                    .thenReturn(Optional.of(share));

            service.leaveUserShare(requester, f);

            verify(fileShareRepository).delete(share);
        }
    }

    // -------------------------------------------------------------------------
    // getShareByToken
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("getShareByToken")
    class GetShareByToken {

        @Test
        void validToken_returnsShare() {
            FileShare share = new FileShare();
            share.setShareToken("t");
            when(fileShareRepository.findByShareTokenWithFile("t")).thenReturn(Optional.of(share));

            assertThat(service.getShareByToken("t")).isSameAs(share);
        }

        @Test
        void notFound_throwsNotFound() {
            when(fileShareRepository.findByShareTokenWithFile("x")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getShareByToken("x"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(404);
        }

        @Test
        void expiredToken_throwsNotFound() {
            FileShare share = new FileShare();
            share.setShareToken("t");
            share.setExpiresAt(LocalDateTime.now().minusDays(1));
            when(fileShareRepository.findByShareTokenWithFile("t")).thenReturn(Optional.of(share));

            assertThatThrownBy(() -> service.getShareByToken("t"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(404);
        }
    }

    // -------------------------------------------------------------------------
    // canAccessShareLink (IDOR protection)
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("canAccessShareLink")
    class CanAccessShareLink {

        @Test
        void linksDisabled_returnsFalse() {
            when(sharingProperties.isLinkEnabled()).thenReturn(false);
            FileShare share = new FileShare();

            assertThat(service.canAccessShareLink(share, authFor(user(1L)))).isFalse();
        }

        @Test
        void expiredShare_returnsFalse() {
            FileShare share = new FileShare();
            share.setExpiresAt(LocalDateTime.now().minusDays(1));

            assertThat(service.canAccessShareLink(share, authFor(user(1L)))).isFalse();
        }

        @Test
        void unauthenticated_returnsFalse() {
            FileShare share = new FileShare();

            assertThat(service.canAccessShareLink(share, null)).isFalse();
        }

        @Test
        void anonymousPrincipal_returnsFalse() {
            FileShare share = new FileShare();
            Authentication anon =
                    new UsernamePasswordAuthenticationToken("anonymousUser", "n/a", List.of());

            assertThat(service.canAccessShareLink(share, anon)).isFalse();
        }

        @Test
        void publicShare_authenticatedUser_returnsTrue() {
            FileShare share = new FileShare();

            assertThat(service.canAccessShareLink(share, authFor(user(1L)))).isTrue();
        }

        @Test
        void userSpecificShare_otherUser_returnsFalse() {
            User owner = user(1L);
            User intended = user(2L);
            User intruder = user(3L);
            StoredFile f = ownedFile(owner);
            FileShare share = shareFor(f, intended, ShareAccessRole.VIEWER);

            assertThat(service.canAccessShareLink(share, authFor(intruder))).isFalse();
        }

        @Test
        void userSpecificShare_intendedRecipient_returnsTrue() {
            User owner = user(1L);
            User intended = user(2L);
            StoredFile f = ownedFile(owner);
            FileShare share = shareFor(f, intended, ShareAccessRole.VIEWER);

            assertThat(service.canAccessShareLink(share, authFor(intended))).isTrue();
        }

        @Test
        void userSpecificShare_fileOwner_returnsTrue() {
            User owner = user(1L);
            User intended = user(2L);
            StoredFile f = ownedFile(owner);
            FileShare share = shareFor(f, intended, ShareAccessRole.VIEWER);

            assertThat(service.canAccessShareLink(share, authFor(owner))).isTrue();
        }
    }

    // -------------------------------------------------------------------------
    // recordShareAccess
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("recordShareAccess")
    class RecordShareAccess {

        @Test
        void nullShare_noOp() {
            service.recordShareAccess(null, authFor(user(1L)), true);
            verify(fileShareAccessRepository, never()).save(any());
        }

        @Test
        void expiredShare_noOp() {
            FileShare share = new FileShare();
            share.setExpiresAt(LocalDateTime.now().minusDays(1));

            service.recordShareAccess(share, authFor(user(1L)), true);

            verify(fileShareAccessRepository, never()).save(any());
        }

        @Test
        void authenticatedUser_savesAccessRecord() {
            FileShare share = new FileShare();

            service.recordShareAccess(share, authFor(user(1L)), false);

            verify(fileShareAccessRepository).save(any(FileShareAccess.class));
        }
    }

    // -------------------------------------------------------------------------
    // listShareAccesses / listShareAccessResponses
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("listShareAccesses")
    class ListShareAccesses {

        @Test
        void nonOwner_throwsForbidden() {
            User owner = user(1L);
            User intruder = user(2L);
            StoredFile f = ownedFile(owner);

            assertThatThrownBy(() -> service.listShareAccesses(intruder, f, "t"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(403);
        }

        @Test
        void tokenNotFound_throwsNotFound() {
            User owner = user(1L);
            StoredFile f = ownedFile(owner);
            when(fileShareRepository.findByShareToken("t")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.listShareAccesses(owner, f, "t"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(404);
        }

        @Test
        void tokenMismatch_throwsForbidden() {
            User owner = user(1L);
            StoredFile f = ownedFile(owner);
            f.setId(1L);
            StoredFile other = ownedFile(owner);
            other.setId(2L);
            FileShare share = shareFor(other, null, ShareAccessRole.VIEWER);
            share.setShareToken("t");
            when(fileShareRepository.findByShareToken("t")).thenReturn(Optional.of(share));

            assertThatThrownBy(() -> service.listShareAccesses(owner, f, "t"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(403);
        }

        @Test
        void ownerValidToken_returnsAccessResponses() {
            User owner = user(1L);
            StoredFile f = ownedFile(owner);
            FileShare share = shareFor(f, null, ShareAccessRole.VIEWER);
            share.setShareToken("t");
            when(fileShareRepository.findByShareToken("t")).thenReturn(Optional.of(share));
            FileShareAccess access = new FileShareAccess();
            access.setUser(user(2L));
            access.setAccessType(
                    stirling.software.proprietary.storage.model.FileShareAccessType.VIEW);
            when(fileShareAccessRepository.findByFileShareWithUserOrderByAccessedAtDesc(share))
                    .thenReturn(List.of(access));

            assertThat(service.listShareAccessResponses(owner, f, "t")).hasSize(1);
        }
    }

    // -------------------------------------------------------------------------
    // normalizeShareRole
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("normalizeShareRole")
    class NormalizeShareRole {

        @Test
        void nullRole_defaultsToEditor() {
            assertThat(service.normalizeShareRole(null)).isEqualTo(ShareAccessRole.EDITOR);
        }

        @Test
        void blankRole_defaultsToEditor() {
            assertThat(service.normalizeShareRole("  ")).isEqualTo(ShareAccessRole.EDITOR);
        }

        @Test
        void validLowercaseRole_parsed() {
            assertThat(service.normalizeShareRole("viewer")).isEqualTo(ShareAccessRole.VIEWER);
        }

        @Test
        void invalidRole_throwsBadRequest() {
            assertThatThrownBy(() -> service.normalizeShareRole("bogus"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(400);
        }
    }

    // -------------------------------------------------------------------------
    // requireEditorAccess / requireReadAccess (FileShare overloads)
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("FileShare access overloads")
    class FileShareAccessOverloads {

        @Test
        void requireEditorAccess_editorShare_passes() {
            FileShare share = new FileShare();
            share.setAccessRole(ShareAccessRole.EDITOR);

            assertThatCode(() -> service.requireEditorAccess(share)).doesNotThrowAnyException();
        }

        @Test
        void requireEditorAccess_viewerShare_throwsForbidden() {
            FileShare share = new FileShare();
            share.setAccessRole(ShareAccessRole.VIEWER);

            assertThatThrownBy(() -> service.requireEditorAccess(share))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(403);
        }

        @Test
        void requireReadAccess_nullRoleShare_defaultsEditorAndPasses() {
            // resolveShareRole maps null role to EDITOR which has read access
            FileShare share = new FileShare();

            assertThatCode(() -> service.requireReadAccess(share)).doesNotThrowAnyException();
        }
    }

    // -------------------------------------------------------------------------
    // validateMainUpload (blocked content types via storeFile)
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("upload validation")
    class UploadValidation {

        @Test
        void emptyFile_throwsBadRequest() {
            User owner = user(1L);
            MockMultipartFile empty =
                    new MockMultipartFile("file", "f.pdf", "application/pdf", new byte[0]);

            assertThatThrownBy(() -> service.storeFile(owner, empty))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(400);
        }

        @Test
        void blockedContentType_throwsBadRequest() {
            User owner = user(1L);
            MockMultipartFile jar =
                    new MockMultipartFile(
                            "file", "evil.jar", "application/java-archive", new byte[] {1});

            assertThatThrownBy(() -> service.storeFile(owner, jar))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(400);
        }
    }

    // -------------------------------------------------------------------------
    // getOwnedFile
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("getOwnedFile")
    class GetOwnedFile {

        @Test
        void found_returnsFile() {
            User owner = user(1L);
            StoredFile f = ownedFile(owner);
            when(storedFileRepository.findByIdAndOwnerWithShares(100L, owner))
                    .thenReturn(Optional.of(f));

            assertThat(service.getOwnedFile(owner, 100L)).isSameAs(f);
        }

        @Test
        void notFound_throwsNotFound() {
            User owner = user(1L);
            when(storedFileRepository.findByIdAndOwnerWithShares(99L, owner))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getOwnedFile(owner, 99L))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(404);
        }
    }

    // -------------------------------------------------------------------------
    // loadFile
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("loadFile")
    class LoadFile {

        @Test
        void providerReturnsResource_returnsIt() throws IOException {
            StoredFile f = new StoredFile();
            f.setStorageKey("k");
            Resource resource = mock(Resource.class);
            when(storageProvider.load("k")).thenReturn(resource);

            assertThat(service.loadFile(f)).isSameAs(resource);
        }

        @Test
        void providerThrowsIo_throwsInternalServerError() throws IOException {
            StoredFile f = new StoredFile();
            f.setStorageKey("k");
            when(storageProvider.load("k")).thenThrow(new IOException("boom"));

            assertThatThrownBy(() -> service.loadFile(f))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(500);
        }
    }

    // -------------------------------------------------------------------------
    // Workflow-aware helpers
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("workflow helpers")
    class WorkflowHelpers {

        @Test
        void storeWorkflowFile_setsPurposeAndSession() throws IOException {
            when(storageProperties.getQuotas()).thenReturn(null);
            User owner = user(1L);
            MockMultipartFile file =
                    new MockMultipartFile("file", "f.pdf", "application/pdf", new byte[] {1});
            when(storageProvider.store(any(), any()))
                    .thenReturn(
                            stirling.software.proprietary.storage.provider.StoredObject.builder()
                                    .storageKey("k")
                                    .originalFilename("f.pdf")
                                    .contentType("application/pdf")
                                    .sizeBytes(1L)
                                    .build());
            when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            WorkflowSession session = new WorkflowSession();

            StoredFile result =
                    service.storeWorkflowFile(owner, file, FilePurpose.SIGNING_ORIGINAL, session);

            assertThat(result.getPurpose()).isEqualTo(FilePurpose.SIGNING_ORIGINAL);
            assertThat(result.getWorkflowSession()).isSameAs(session);
        }

        @Test
        void isWorkflowFile_noSession_false() {
            StoredFile f = new StoredFile();

            assertThat(service.isWorkflowFile(f)).isFalse();
        }

        @Test
        void isWorkflowFile_activeSession_true() {
            StoredFile f = new StoredFile();
            WorkflowSession session = mock(WorkflowSession.class);
            when(session.isActive()).thenReturn(true);
            f.setWorkflowSession(session);

            assertThat(service.isWorkflowFile(f)).isTrue();
        }

        @Test
        void getWorkflowFiles_delegatesToRepository() {
            WorkflowSession session = new WorkflowSession();
            StoredFile f = new StoredFile();
            when(storedFileRepository.findByWorkflowSession(session)).thenReturn(List.of(f));

            assertThat(service.getWorkflowFiles(session)).containsExactly(f);
        }

        @Test
        void countWorkflowStorageBytes_sumsSizes() {
            WorkflowSession session = new WorkflowSession();
            StoredFile a = new StoredFile();
            a.setSizeBytes(10L);
            StoredFile b = new StoredFile();
            b.setSizeBytes(15L);
            when(storedFileRepository.findByWorkflowSession(session)).thenReturn(List.of(a, b));

            assertThat(service.countWorkflowStorageBytes(session)).isEqualTo(25L);
        }

        @Test
        void validateWorkflowDeletion_activeWorkflow_throwsBadRequest() {
            StoredFile f = new StoredFile();
            WorkflowSession session = mock(WorkflowSession.class);
            when(session.isActive()).thenReturn(true);
            f.setWorkflowSession(session);

            assertThatThrownBy(() -> service.validateWorkflowDeletion(f, user(1L)))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(400);
        }
    }

    // -------------------------------------------------------------------------
    // listAccessibleFileResponses
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listAccessibleFileResponses sorts newest-first and resolves roles")
    void listAccessibleFileResponses_returnsSortedResponses() {
        User user = user(2L);
        User owner = user(1L);
        StoredFile older = ownedFile(owner);
        older.setId(10L);
        older.setCreatedAt(LocalDateTime.now().minusDays(2));
        StoredFile newer = ownedFile(owner);
        newer.setId(11L);
        newer.setCreatedAt(LocalDateTime.now().minusDays(1));
        when(storedFileRepository.findAccessibleFiles(user)).thenReturn(List.of(older, newer));
        FileShare share = shareFor(newer, user, ShareAccessRole.VIEWER);
        when(fileShareRepository.findBySharedWithUserAndFileIn(user, List.of(older, newer)))
                .thenReturn(List.of(share));

        var responses = service.listAccessibleFileResponses(user);

        assertThat(responses).hasSize(2);
        // newest first
        assertThat(responses.get(0).getId()).isEqualTo(11L);
        assertThat(responses.get(0).getAccessRole()).isEqualTo("viewer");
    }

    @Test
    @DisplayName("listAccessibleFiles delegates to repository")
    void listAccessibleFiles_delegates() {
        User user = user(1L);
        StoredFile f = ownedFile(user);
        when(storedFileRepository.findAccessibleFiles(user)).thenReturn(List.of(f));

        assertThat(service.listAccessibleFiles(user)).containsExactly(f);
    }
}
