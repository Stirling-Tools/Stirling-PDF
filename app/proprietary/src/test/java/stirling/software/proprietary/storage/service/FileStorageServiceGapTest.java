package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import jakarta.mail.MessagingException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.storage.model.FilePurpose;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.FileShareAccess;
import stirling.software.proprietary.storage.model.FileShareAccessType;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StorageCleanupEntry;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.model.api.ShareLinkAccessResponse;
import stirling.software.proprietary.storage.model.api.ShareLinkMetadataResponse;
import stirling.software.proprietary.storage.model.api.StoredFileResponse;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.model.WorkflowSession;

/**
 * Companion gap-coverage suite for {@link FileStorageService}. Targets branches not exercised by
 * {@code FileStorageServiceTest}: enable/auth guards, response builders, share-link access control,
 * access recording, email sharing flows, and the workflow-aware helpers.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FileStorageServiceGapTest {

    @Mock private StoredFileRepository storedFileRepository;
    @Mock private FileShareRepository fileShareRepository;
    @Mock private FileShareAccessRepository fileShareAccessRepository;
    @Mock private UserRepository userRepository;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private StorageProvider storageProvider;
    @Mock private StorageCleanupEntryRepository storageCleanupEntryRepository;
    @Mock private EmailService emailService;

    @Mock private ApplicationProperties.Security securityProperties;
    @Mock private ApplicationProperties.System systemProperties;
    @Mock private ApplicationProperties.Storage storageProperties;
    @Mock private ApplicationProperties.Storage.Sharing sharingProperties;
    @Mock private ApplicationProperties.Storage.Quotas quotasProperties;
    @Mock private ApplicationProperties.Mail mailProperties;

    private FileStorageService service;

    @BeforeEach
    void setUp() {
        service = newService(Optional.of(emailService));

        // Default: storage + sharing fully enabled, share links enabled, no link expiry, mail off.
        when(applicationProperties.getSecurity()).thenReturn(securityProperties);
        when(securityProperties.isEnableLogin()).thenReturn(true);
        when(applicationProperties.getStorage()).thenReturn(storageProperties);
        when(storageProperties.isEnabled()).thenReturn(true);
        when(storageProperties.getSharing()).thenReturn(sharingProperties);
        when(sharingProperties.isEnabled()).thenReturn(true);
        when(sharingProperties.isLinkEnabled()).thenReturn(true);
        when(sharingProperties.isEmailEnabled()).thenReturn(false);
        when(sharingProperties.getLinkExpirationDays()).thenReturn(0);
        when(applicationProperties.getSystem()).thenReturn(systemProperties);
        when(systemProperties.getFrontendUrl()).thenReturn("http://localhost:8080");
        when(applicationProperties.getMail()).thenReturn(mailProperties);
        when(mailProperties.isEnabled()).thenReturn(false);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private FileStorageService newService(Optional<EmailService> email) {
        return new FileStorageService(
                storedFileRepository,
                fileShareRepository,
                fileShareAccessRepository,
                userRepository,
                applicationProperties,
                storageProvider,
                email,
                storageCleanupEntryRepository);
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

    private Authentication authFor(User u) {
        return new UsernamePasswordAuthenticationToken(u, "creds", List.of());
    }

    private int status(Throwable t) {
        return ((ResponseStatusException) t).getStatusCode().value();
    }

    // -------------------------------------------------------------------------
    // ensureStorageEnabled / ensureSharingEnabled / ensureShareLinksEnabled
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("enable guards")
    class EnableGuards {

        @Test
        void ensureStorageEnabled_loginDisabled_forbidden() {
            when(securityProperties.isEnableLogin()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureStorageEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(403);
        }

        @Test
        void ensureStorageEnabled_storageDisabled_forbidden() {
            when(storageProperties.isEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureStorageEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(403);
        }

        @Test
        void ensureStorageEnabled_allEnabled_passes() {
            service.ensureStorageEnabled();
        }

        @Test
        void ensureSharingEnabled_sharingDisabled_forbidden() {
            when(sharingProperties.isEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureSharingEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(403);
        }

        @Test
        void ensureShareLinksEnabled_linkDisabled_forbidden() {
            when(sharingProperties.isLinkEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureShareLinksEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(403);
        }

        @Test
        void ensureShareLinksEnabled_blankFrontendUrl_forbidden() {
            // link flag on, but no frontend URL -> isShareLinksEnabled() == false
            when(systemProperties.getFrontendUrl()).thenReturn("   ");

            assertThatThrownBy(() -> service.ensureShareLinksEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(403);
        }

        @Test
        void ensureShareLinksEnabled_allEnabled_passes() {
            service.ensureShareLinksEnabled();
        }
    }

    // -------------------------------------------------------------------------
    // requireAuthenticatedUser
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("requireAuthenticatedUser")
    class RequireAuthenticatedUser {

        @Test
        void nullAuthentication_unauthorized() {
            SecurityContextHolder.clearContext();

            assertThatThrownBy(() -> service.requireAuthenticatedUser())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(401);
        }

        @Test
        void anonymousPrincipal_unauthorized() {
            Authentication anon =
                    new AnonymousAuthenticationToken(
                            "key",
                            "anonymousUser",
                            List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
            SecurityContextHolder.getContext().setAuthentication(anon);

            assertThatThrownBy(() -> service.requireAuthenticatedUser())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(401);
        }

        @Test
        void notAuthenticatedToken_unauthorized() {
            // 2-arg ctor leaves isAuthenticated() == false
            SecurityContextHolder.getContext()
                    .setAuthentication(new UsernamePasswordAuthenticationToken(user(1L), "x"));

            assertThatThrownBy(() -> service.requireAuthenticatedUser())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(401);
        }

        @Test
        void nonUserPrincipal_unauthorized() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken("plainName", "x", List.of()));

            assertThatThrownBy(() -> service.requireAuthenticatedUser())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(401);
        }

        @Test
        void validUserPrincipal_returnsUser() {
            User u = user(7L);
            SecurityContextHolder.getContext().setAuthentication(authFor(u));

            assertThat(service.requireAuthenticatedUser()).isSameAs(u);
        }
    }

    // -------------------------------------------------------------------------
    // listAccessibleFiles / getOwnedFile
    // -------------------------------------------------------------------------

    @Test
    void listAccessibleFiles_delegatesToRepository() {
        User u = user(1L);
        StoredFile f = ownedFile(u);
        when(storedFileRepository.findAccessibleFiles(u)).thenReturn(List.of(f));

        assertThat(service.listAccessibleFiles(u)).containsExactly(f);
    }

    @Test
    void getOwnedFile_found_returnsFile() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(storedFileRepository.findByIdAndOwnerWithShares(100L, owner))
                .thenReturn(Optional.of(f));

        assertThat(service.getOwnedFile(owner, 100L)).isSameAs(f);
    }

    @Test
    void getOwnedFile_missing_throwsNotFound() {
        User owner = user(1L);
        when(storedFileRepository.findByIdAndOwnerWithShares(999L, owner))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getOwnedFile(owner, 999L))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(404);
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
            assertThat(service.normalizeShareRole("   ")).isEqualTo(ShareAccessRole.EDITOR);
        }

        @Test
        void mixedCaseTrimmed_parsed() {
            assertThat(service.normalizeShareRole("  viewer ")).isEqualTo(ShareAccessRole.VIEWER);
        }

        @Test
        void invalidRole_throwsBadRequest() {
            assertThatThrownBy(() -> service.normalizeShareRole("superadmin"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(400);
        }
    }

    // -------------------------------------------------------------------------
    // requireEditorAccess(FileShare) / requireReadAccess(FileShare)
    // -------------------------------------------------------------------------

    @Test
    void requireEditorAccess_share_editor_passes() {
        service.requireEditorAccess(shareFor(null, null, ShareAccessRole.EDITOR));
    }

    @Test
    void requireEditorAccess_share_nullRoleDefaultsEditor_passes() {
        // resolveShareRole returns EDITOR when accessRole is null
        service.requireEditorAccess(shareFor(null, null, null));
    }

    @Test
    void requireEditorAccess_share_viewer_forbidden() {
        assertThatThrownBy(
                        () ->
                                service.requireEditorAccess(
                                        shareFor(null, null, ShareAccessRole.VIEWER)))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(403);
    }

    @Test
    void requireReadAccess_share_commenter_passes() {
        service.requireReadAccess(shareFor(null, null, ShareAccessRole.COMMENTER));
    }

    @Test
    void requireReadAccess_share_nullShare_defaultsEditor_passes() {
        // null share -> resolveShareRole returns EDITOR -> hasReadAccess true
        service.requireReadAccess((FileShare) null);
    }

    @Test
    void requireReadAccess_user_noShare_defaultsViewer_passes() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile f = ownedFile(owner);
        when(fileShareRepository.findByFileAndSharedWithUser(f, requester))
                .thenReturn(Optional.empty());

        // resolveUserShareRole returns VIEWER, which still grants read access
        service.requireReadAccess(requester, f);
    }

    // -------------------------------------------------------------------------
    // loadFile
    // -------------------------------------------------------------------------

    @Test
    void loadFile_success_returnsResource() throws IOException {
        StoredFile f = ownedFile(user(1L));
        f.setStorageKey("key-1");
        Resource resource = new ByteArrayResource(new byte[] {1, 2, 3});
        when(storageProvider.load("key-1")).thenReturn(resource);

        assertThat(service.loadFile(f)).isSameAs(resource);
    }

    @Test
    void loadFile_ioError_throwsInternalServerError() throws IOException {
        StoredFile f = ownedFile(user(1L));
        f.setStorageKey("key-1");
        when(storageProvider.load("key-1")).thenThrow(new IOException("boom"));

        assertThatThrownBy(() -> service.loadFile(f))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(500);
    }

    // -------------------------------------------------------------------------
    // leaveUserShare
    // -------------------------------------------------------------------------

    @Test
    void leaveUserShare_owner_forbidden() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);

        assertThatThrownBy(() -> service.leaveUserShare(owner, f))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(403);
        verify(fileShareRepository, never()).delete(any());
    }

    @Test
    void leaveUserShare_noShare_notFound() {
        User owner = user(1L);
        User other = user(2L);
        StoredFile f = ownedFile(owner);
        when(fileShareRepository.findByFileAndSharedWithUser(f, other))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.leaveUserShare(other, f))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(404);
    }

    @Test
    void leaveUserShare_validShare_deleted() {
        User owner = user(1L);
        User other = user(2L);
        StoredFile f = ownedFile(owner);
        FileShare share = shareFor(f, other, ShareAccessRole.VIEWER);
        when(fileShareRepository.findByFileAndSharedWithUser(f, other))
                .thenReturn(Optional.of(share));

        service.leaveUserShare(other, f);

        verify(fileShareRepository).delete(share);
    }

    // -------------------------------------------------------------------------
    // getShareByToken
    // -------------------------------------------------------------------------

    @Test
    void getShareByToken_found_returnsShare() {
        FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);
        share.setShareToken("tok");
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.of(share));

        assertThat(service.getShareByToken("tok")).isSameAs(share);
    }

    @Test
    void getShareByToken_missing_notFound() {
        when(fileShareRepository.findByShareTokenWithFile("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getShareByToken("nope"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(404);
    }

    @Test
    void getShareByToken_expired_notFound() {
        FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);
        share.setShareToken("tok");
        share.setExpiresAt(LocalDateTime.now().minusDays(1));
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.of(share));

        assertThatThrownBy(() -> service.getShareByToken("tok"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(404);
    }

    // -------------------------------------------------------------------------
    // canAccessShareLink
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("canAccessShareLink")
    class CanAccessShareLink {

        @Test
        void linksDisabled_false() {
            when(sharingProperties.isLinkEnabled()).thenReturn(false);
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);

            assertThat(service.canAccessShareLink(share, authFor(user(2L)))).isFalse();
        }

        @Test
        void expired_false() {
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);
            share.setExpiresAt(LocalDateTime.now().minusMinutes(1));

            assertThat(service.canAccessShareLink(share, authFor(user(2L)))).isFalse();
        }

        @Test
        void nullAuthentication_false() {
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);

            assertThat(service.canAccessShareLink(share, null)).isFalse();
        }

        @Test
        void anonymous_false() {
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);
            Authentication anon =
                    new AnonymousAuthenticationToken(
                            "key",
                            "anonymousUser",
                            List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

            assertThat(service.canAccessShareLink(share, anon)).isFalse();
        }

        @Test
        void publicLink_anyAuthenticatedUser_true() {
            // no sharedWithUser -> public link, any authenticated user may access
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);

            assertThat(service.canAccessShareLink(share, authFor(user(2L)))).isTrue();
        }

        @Test
        void userSpecific_intendedRecipient_true() {
            User recipient = user(2L);
            FileShare share = shareFor(ownedFile(user(1L)), recipient, ShareAccessRole.VIEWER);

            assertThat(service.canAccessShareLink(share, authFor(recipient))).isTrue();
        }

        @Test
        void userSpecific_fileOwner_true() {
            User owner = user(1L);
            User recipient = user(2L);
            FileShare share = shareFor(ownedFile(owner), recipient, ShareAccessRole.VIEWER);

            assertThat(service.canAccessShareLink(share, authFor(owner))).isTrue();
        }

        @Test
        void userSpecific_unrelatedUser_false() {
            FileShare share = shareFor(ownedFile(user(1L)), user(2L), ShareAccessRole.VIEWER);

            assertThat(service.canAccessShareLink(share, authFor(user(3L)))).isFalse();
        }

        @Test
        void userSpecific_nonUserPrincipal_false() {
            FileShare share = shareFor(ownedFile(user(1L)), user(2L), ShareAccessRole.VIEWER);
            Authentication auth =
                    new UsernamePasswordAuthenticationToken("plainName", "x", List.of());

            assertThat(service.canAccessShareLink(share, auth)).isFalse();
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
            service.recordShareAccess(null, authFor(user(2L)), false);
            verifyNoInteractions(fileShareAccessRepository);
        }

        @Test
        void expiredShare_noOp() {
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);
            share.setExpiresAt(LocalDateTime.now().minusDays(1));

            service.recordShareAccess(share, authFor(user(2L)), false);

            verify(fileShareAccessRepository, never()).save(any());
        }

        @Test
        void linksDisabled_noOp() {
            when(sharingProperties.isLinkEnabled()).thenReturn(false);
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);

            service.recordShareAccess(share, authFor(user(2L)), false);

            verify(fileShareAccessRepository, never()).save(any());
        }

        @Test
        void nonUserPrincipal_noOp() {
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);
            Authentication auth =
                    new UsernamePasswordAuthenticationToken("plainName", "x", List.of());

            service.recordShareAccess(share, auth, false);

            verify(fileShareAccessRepository, never()).save(any());
        }

        @Test
        void inlineAccess_recordsView() {
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);
            User viewer = user(2L);

            service.recordShareAccess(share, authFor(viewer), true);

            ArgumentCaptor<FileShareAccess> captor = ArgumentCaptor.forClass(FileShareAccess.class);
            verify(fileShareAccessRepository).save(captor.capture());
            FileShareAccess saved = captor.getValue();
            assertThat(saved.getAccessType()).isEqualTo(FileShareAccessType.VIEW);
            assertThat(saved.getUser()).isEqualTo(viewer);
            assertThat(saved.getFileShare()).isEqualTo(share);
        }

        @Test
        void downloadAccess_recordsDownload() {
            FileShare share = shareFor(ownedFile(user(1L)), null, ShareAccessRole.VIEWER);

            service.recordShareAccess(share, authFor(user(2L)), false);

            ArgumentCaptor<FileShareAccess> captor = ArgumentCaptor.forClass(FileShareAccess.class);
            verify(fileShareAccessRepository).save(captor.capture());
            assertThat(captor.getValue().getAccessType()).isEqualTo(FileShareAccessType.DOWNLOAD);
        }
    }

    // -------------------------------------------------------------------------
    // listShareAccesses / listShareAccessResponses
    // -------------------------------------------------------------------------

    @Test
    void listShareAccesses_nonOwner_forbidden() {
        User owner = user(1L);
        User other = user(2L);
        StoredFile f = ownedFile(owner);

        assertThatThrownBy(() -> service.listShareAccesses(other, f, "tok"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(403);
    }

    @Test
    void listShareAccesses_tokenNotFound_notFound() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(fileShareRepository.findByShareToken("tok")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.listShareAccesses(owner, f, "tok"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(404);
    }

    @Test
    void listShareAccesses_tokenForOtherFile_forbidden() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        f.setId(1L);
        StoredFile other = ownedFile(owner);
        other.setId(2L);
        FileShare share = shareFor(other, null, ShareAccessRole.VIEWER);
        share.setShareToken("tok");
        when(fileShareRepository.findByShareToken("tok")).thenReturn(Optional.of(share));

        assertThatThrownBy(() -> service.listShareAccesses(owner, f, "tok"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(403);
    }

    @Test
    void listShareAccessResponses_maps_access() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        FileShare share = shareFor(f, null, ShareAccessRole.VIEWER);
        share.setShareToken("tok");
        when(fileShareRepository.findByShareToken("tok")).thenReturn(Optional.of(share));

        User accessor = user(2L);
        FileShareAccess access = new FileShareAccess();
        access.setFileShare(share);
        access.setUser(accessor);
        access.setAccessType(FileShareAccessType.DOWNLOAD);
        access.setAccessedAt(LocalDateTime.now());
        when(fileShareAccessRepository.findByFileShareWithUserOrderByAccessedAtDesc(share))
                .thenReturn(List.of(access));

        List<ShareLinkAccessResponse> responses = service.listShareAccessResponses(owner, f, "tok");

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).getUsername()).isEqualTo("user2");
        assertThat(responses.get(0).getAccessType()).isEqualTo("DOWNLOAD");
    }

    @Test
    void listShareAccessResponses_nullUser_mapsNullUsername() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        FileShare share = shareFor(f, null, ShareAccessRole.VIEWER);
        share.setShareToken("tok");
        when(fileShareRepository.findByShareToken("tok")).thenReturn(Optional.of(share));

        FileShareAccess access = new FileShareAccess();
        access.setFileShare(share);
        access.setUser(null);
        access.setAccessType(FileShareAccessType.VIEW);
        when(fileShareAccessRepository.findByFileShareWithUserOrderByAccessedAtDesc(share))
                .thenReturn(List.of(access));

        List<ShareLinkAccessResponse> responses = service.listShareAccessResponses(owner, f, "tok");

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).getUsername()).isNull();
        assertThat(responses.get(0).getAccessType()).isEqualTo("VIEW");
    }

    // -------------------------------------------------------------------------
    // listAccessedShareLinks / listAccessedShareLinkResponses
    // -------------------------------------------------------------------------

    @Test
    void listAccessedShareLinks_filtersNullShareNullTokenExpired_andDedupes() {
        User user = user(2L);
        StoredFile file = ownedFile(user(1L));

        // 1) access with null fileShare -> skipped
        FileShareAccess nullShareAccess = new FileShareAccess();
        nullShareAccess.setFileShare(null);

        // 2) share with null token -> skipped
        FileShare blankTokenShare = shareFor(file, null, ShareAccessRole.VIEWER);
        blankTokenShare.setShareToken("  ");
        FileShareAccess blankTokenAccess = new FileShareAccess();
        blankTokenAccess.setFileShare(blankTokenShare);

        // 3) expired share -> skipped
        FileShare expiredShare = shareFor(file, null, ShareAccessRole.VIEWER);
        expiredShare.setShareToken("expired");
        expiredShare.setExpiresAt(LocalDateTime.now().minusDays(1));
        FileShareAccess expiredAccess = new FileShareAccess();
        expiredAccess.setFileShare(expiredShare);

        // 4) two accesses with the same token -> only the first kept
        FileShare goodShare = shareFor(file, null, ShareAccessRole.VIEWER);
        goodShare.setShareToken("good");
        FileShareAccess first = new FileShareAccess();
        first.setFileShare(goodShare);
        first.setAccessedAt(LocalDateTime.now());
        FileShareAccess second = new FileShareAccess();
        second.setFileShare(goodShare);
        second.setAccessedAt(LocalDateTime.now().minusHours(1));

        when(fileShareAccessRepository.findByUserWithShareAndFile(user))
                .thenReturn(
                        List.of(nullShareAccess, blankTokenAccess, expiredAccess, first, second));

        List<FileShareAccess> result = service.listAccessedShareLinks(user);

        assertThat(result).containsExactly(first);
    }

    @Test
    void listAccessedShareLinkResponses_buildsMetadata_andMarksOwnership() {
        User user = user(1L);
        StoredFile file = ownedFile(user); // owned by the querying user
        file.setOriginalFilename("mine.pdf");
        FileShare share = shareFor(file, null, ShareAccessRole.EDITOR);
        share.setShareToken("good");
        FileShareAccess access = new FileShareAccess();
        access.setFileShare(share);
        access.setAccessedAt(LocalDateTime.now());

        when(fileShareAccessRepository.findByUserWithShareAndFile(user))
                .thenReturn(List.of(access));

        List<ShareLinkMetadataResponse> responses = service.listAccessedShareLinkResponses(user);

        assertThat(responses).hasSize(1);
        ShareLinkMetadataResponse meta = responses.get(0);
        assertThat(meta.getShareToken()).isEqualTo("good");
        assertThat(meta.getFileName()).isEqualTo("mine.pdf");
        assertThat(meta.getFileId()).isEqualTo(100L);
        assertThat(meta.getOwner()).isEqualTo("user1");
        assertThat(meta.isOwnedByCurrentUser()).isTrue();
        assertThat(meta.getAccessRole()).isEqualTo("editor");
    }

    // -------------------------------------------------------------------------
    // Response builders: buildResponse via public methods
    // -------------------------------------------------------------------------

    @Test
    void getAccessibleFileResponse_owner_marksEditorAndOwnership() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        f.setContentType("application/pdf");
        f.setSizeBytes(123L);
        when(storedFileRepository.findByIdWithShares(100L)).thenReturn(Optional.of(f));

        StoredFileResponse response = service.getAccessibleFileResponse(owner, 100L);

        assertThat(response.isOwnedByCurrentUser()).isTrue();
        assertThat(response.getAccessRole()).isEqualTo("editor");
        assertThat(response.getOwner()).isEqualTo("user1");
        assertThat(response.getFileName()).isEqualTo("test.pdf");
        assertThat(response.getSharedWithUsers()).isEmpty();
    }

    @Test
    void getAccessibleFileResponse_sharedViewer_marksViewerNotOwned() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile f = ownedFile(owner);
        f.getShares().add(shareFor(f, requester, ShareAccessRole.VIEWER));
        when(storedFileRepository.findByIdWithShares(100L)).thenReturn(Optional.of(f));
        when(fileShareRepository.findByFileAndSharedWithUser(f, requester))
                .thenReturn(Optional.of(shareFor(f, requester, ShareAccessRole.VIEWER)));

        StoredFileResponse response = service.getAccessibleFileResponse(requester, 100L);

        assertThat(response.isOwnedByCurrentUser()).isFalse();
        assertThat(response.getAccessRole()).isEqualTo("viewer");
        // non-owner view exposes no sharedWith / sharedUsers / shareLinks
        assertThat(response.getSharedWithUsers()).isEmpty();
        assertThat(response.getSharedUsers()).isEmpty();
        assertThat(response.getShareLinks()).isEmpty();
    }

    @Test
    void listAccessibleFileResponses_sortsByCreatedAtDescending() {
        User user = user(1L);
        StoredFile older = ownedFile(user);
        older.setId(1L);
        older.setCreatedAt(LocalDateTime.now().minusDays(2));
        StoredFile newer = ownedFile(user);
        newer.setId(2L);
        newer.setCreatedAt(LocalDateTime.now());
        when(storedFileRepository.findAccessibleFiles(user)).thenReturn(List.of(older, newer));
        when(fileShareRepository.findBySharedWithUserAndFileIn(eq(user), any()))
                .thenReturn(List.of());

        List<StoredFileResponse> responses = service.listAccessibleFileResponses(user);

        assertThat(responses).extracting(StoredFileResponse::getId).containsExactly(2L, 1L);
    }

    @Test
    void listAccessibleFileResponses_emptyList_returnsEmpty() {
        User user = user(1L);
        when(storedFileRepository.findAccessibleFiles(user)).thenReturn(List.of());

        assertThat(service.listAccessibleFileResponses(user)).isEmpty();
        // no share lookup when there are no files
        verify(fileShareRepository, never()).findBySharedWithUserAndFileIn(any(), any());
    }

    @Test
    void shareWithUserResponse_sharesThenReloadsAndBuilds() {
        User owner = user(1L);
        User target = user(2L);
        StoredFile f = ownedFile(owner);
        when(storedFileRepository.findByIdAndOwnerWithShares(100L, owner))
                .thenReturn(Optional.of(f));
        when(userRepository.findByUsernameIgnoreCase("user2")).thenReturn(Optional.of(target));
        when(fileShareRepository.findByFileAndSharedWithUser(f, target))
                .thenReturn(Optional.empty());
        when(fileShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        StoredFileResponse response =
                service.shareWithUserResponse(owner, 100L, "user2", ShareAccessRole.VIEWER);

        assertThat(response.isOwnedByCurrentUser()).isTrue();
        // getOwnedFile invoked twice: once before share, once to reload
        verify(storedFileRepository, times(2)).findByIdAndOwnerWithShares(100L, owner);
    }

    // -------------------------------------------------------------------------
    // validateMainUpload (via storeFile) — blocked content type & missing file
    // -------------------------------------------------------------------------

    @Test
    void storeFile_missingFile_badRequest() {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        MockMultipartFile empty =
                new MockMultipartFile("file", "empty.pdf", "application/pdf", new byte[0]);

        assertThatThrownBy(() -> service.storeFile(owner, empty))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(400);
    }

    @Test
    void storeFile_blockedContentType_badRequest() {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        MockMultipartFile exe =
                new MockMultipartFile(
                        "file", "evil.exe", "application/x-msdownload", new byte[] {1});

        assertThatThrownBy(() -> service.storeFile(owner, exe))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(400);
    }

    // -------------------------------------------------------------------------
    // storeFile — IOError cleanup path & save-error rollback
    // -------------------------------------------------------------------------

    @Test
    void storeFile_storeIoError_cleansUpAndThrows500() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        MockMultipartFile file =
                new MockMultipartFile("file", "f.pdf", "application/pdf", new byte[] {1});
        when(storageProvider.store(any(), any())).thenThrow(new IOException("disk full"));

        assertThatThrownBy(() -> service.storeFile(owner, file))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(500);

        verify(storedFileRepository, never()).save(any());
    }

    @Test
    void storeFile_saveError_cleansUpStoredObjectAndRethrows() throws IOException {
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        MockMultipartFile file =
                new MockMultipartFile("file", "f.pdf", "application/pdf", new byte[] {1});
        when(storageProvider.store(any(), any()))
                .thenReturn(
                        StoredObject.builder()
                                .storageKey("main-key")
                                .originalFilename("f.pdf")
                                .contentType("application/pdf")
                                .sizeBytes(1L)
                                .build());
        when(storedFileRepository.save(any())).thenThrow(new RuntimeException("db down"));

        assertThatThrownBy(() -> service.storeFile(owner, file))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("db down");

        // cleanup deletes the orphaned main object
        verify(storageProvider).delete("main-key");
    }

    @Test
    void cleanupStoredKey_deleteFails_schedulesCleanupEntry() throws IOException {
        // Drive the cleanup branch where storageProvider.delete throws -> a cleanup entry is saved.
        when(storageProperties.getQuotas()).thenReturn(null);
        User owner = user(1L);
        MockMultipartFile file =
                new MockMultipartFile("file", "f.pdf", "application/pdf", new byte[] {1});
        when(storageProvider.store(any(), any()))
                .thenReturn(
                        StoredObject.builder()
                                .storageKey("main-key")
                                .originalFilename("f.pdf")
                                .contentType("application/pdf")
                                .sizeBytes(1L)
                                .build());
        when(storedFileRepository.save(any())).thenThrow(new RuntimeException("db down"));
        doThrow(new IOException("delete failed")).when(storageProvider).delete("main-key");

        assertThatThrownBy(() -> service.storeFile(owner, file))
                .isInstanceOf(RuntimeException.class);

        ArgumentCaptor<StorageCleanupEntry> captor =
                ArgumentCaptor.forClass(StorageCleanupEntry.class);
        verify(storageCleanupEntryRepository).save(captor.capture());
        assertThat(captor.getValue().getStorageKey()).isEqualTo("main-key");
    }

    // -------------------------------------------------------------------------
    // replaceFile — non-owner forbidden
    // -------------------------------------------------------------------------

    @Test
    void replaceFile_nonOwner_forbidden() {
        User owner = user(1L);
        User other = user(2L);
        StoredFile existing = ownedFile(owner);
        MockMultipartFile file =
                new MockMultipartFile("file", "f.pdf", "application/pdf", new byte[] {1});

        assertThatThrownBy(() -> service.replaceFile(other, existing, file))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(403);
    }

    // -------------------------------------------------------------------------
    // deleteFile — happy path deletes share-link access records + storage keys
    // -------------------------------------------------------------------------

    @Test
    void deleteFile_withShareLinksAndKeys_cleansEverything() throws IOException {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        f.setStorageKey("main-key");
        f.setHistoryStorageKey("hist-key");
        FileShare link = shareFor(f, null, ShareAccessRole.VIEWER);
        link.setShareToken("tok");
        when(fileShareRepository.findShareLinks(f)).thenReturn(List.of(link));

        service.deleteFile(owner, f);

        verify(fileShareAccessRepository).deleteByFileShare(link);
        verify(storedFileRepository).delete(f);
        verify(storageProvider).delete("main-key");
        verify(storageProvider).delete("hist-key");
    }

    @Test
    void deleteFile_nonOwner_forbidden() {
        User owner = user(1L);
        User other = user(2L);
        StoredFile f = ownedFile(owner);

        assertThatThrownBy(() -> service.deleteFile(other, f))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(403);
        verify(storedFileRepository, never()).delete(any());
    }

    // -------------------------------------------------------------------------
    // shareWithUser — email-sharing branches
    // -------------------------------------------------------------------------

    @Test
    void shareWithUser_unknownUsername_notEmail_notFound() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(userRepository.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.shareWithUser(owner, f, "ghost", ShareAccessRole.VIEWER))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(404);
    }

    @Test
    void shareWithUser_emailButEmailSharingDisabled_badRequest() {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(userRepository.findByUsernameIgnoreCase("a@b.com")).thenReturn(Optional.empty());
        when(sharingProperties.isEmailEnabled()).thenReturn(false);

        assertThatThrownBy(() -> service.shareWithUser(owner, f, "a@b.com", ShareAccessRole.VIEWER))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(400);
    }

    @Test
    void shareWithUser_emailUserNotFound_emailEnabled_createsLinkAndNotifies()
            throws MessagingException {
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(userRepository.findByUsernameIgnoreCase("a@b.com")).thenReturn(Optional.empty());
        when(sharingProperties.isEmailEnabled()).thenReturn(true);
        when(mailProperties.isEnabled()).thenReturn(true);
        when(fileShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FileShare result = service.shareWithUser(owner, f, "a@b.com", ShareAccessRole.VIEWER);

        // a share-link token was generated for the email recipient
        assertThat(result.getShareToken()).isNotNull();
        verify(emailService).sendPlainEmail(eq("a@b.com"), any(), any(), anyBoolean());
    }

    @Test
    void shareWithUser_existingUserWithEmailUsername_sendsNotificationToo()
            throws MessagingException {
        User owner = user(1L);
        User target = user(2L);
        target.setUsername("a@b.com");
        StoredFile f = ownedFile(owner);
        when(userRepository.findByUsernameIgnoreCase("a@b.com")).thenReturn(Optional.of(target));
        when(fileShareRepository.findByFileAndSharedWithUser(f, target))
                .thenReturn(Optional.empty());
        when(sharingProperties.isEmailEnabled()).thenReturn(true);
        when(mailProperties.isEnabled()).thenReturn(true);
        when(fileShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FileShare share = service.shareWithUser(owner, f, "a@b.com", ShareAccessRole.VIEWER);

        assertThat(share.getSharedWithUser()).isEqualTo(target);
        verify(emailService).sendPlainEmail(eq("a@b.com"), any(), any(), anyBoolean());
    }

    @Test
    void shareWithUser_sharingDisabled_forbidden() {
        when(sharingProperties.isEnabled()).thenReturn(false);
        User owner = user(1L);
        StoredFile f = ownedFile(owner);

        assertThatThrownBy(() -> service.shareWithUser(owner, f, "user2", ShareAccessRole.VIEWER))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(this::status)
                .isEqualTo(403);
    }

    // -------------------------------------------------------------------------
    // createShareLink — expiration days configured
    // -------------------------------------------------------------------------

    @Test
    void createShareLink_positiveExpirationDays_setsExpiry() {
        when(sharingProperties.getLinkExpirationDays()).thenReturn(3);
        User owner = user(1L);
        StoredFile f = ownedFile(owner);
        when(fileShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FileShare result = service.createShareLink(owner, f, ShareAccessRole.EDITOR);

        assertThat(result.getExpiresAt()).isNotNull();
        assertThat(result.getExpiresAt()).isAfter(LocalDateTime.now());
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
            WorkflowSession session = mock(WorkflowSession.class);
            StoredObject stored =
                    StoredObject.builder()
                            .storageKey("k")
                            .originalFilename("f.pdf")
                            .contentType("application/pdf")
                            .sizeBytes(1L)
                            .build();
            when(storageProvider.store(any(), any())).thenReturn(stored);
            when(storedFileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            StoredFile result =
                    service.storeWorkflowFile(owner, file, FilePurpose.SIGNING_ORIGINAL, session);

            assertThat(result.getPurpose()).isEqualTo(FilePurpose.SIGNING_ORIGINAL);
            assertThat(result.getWorkflowSession()).isEqualTo(session);
            // saved twice: once in storeFile, once after applying workflow metadata
            verify(storedFileRepository, times(2)).save(any(StoredFile.class));
        }

        @Test
        void isWorkflowFile_noSession_false() {
            StoredFile f = ownedFile(user(1L));

            assertThat(service.isWorkflowFile(f)).isFalse();
        }

        @Test
        void isWorkflowFile_activeSession_true() {
            StoredFile f = ownedFile(user(1L));
            WorkflowSession session = mock(WorkflowSession.class);
            when(session.isActive()).thenReturn(true);
            f.setWorkflowSession(session);

            assertThat(service.isWorkflowFile(f)).isTrue();
        }

        @Test
        void isWorkflowFile_inactiveSession_false() {
            StoredFile f = ownedFile(user(1L));
            WorkflowSession session = mock(WorkflowSession.class);
            when(session.isActive()).thenReturn(false);
            f.setWorkflowSession(session);

            assertThat(service.isWorkflowFile(f)).isFalse();
        }

        @Test
        void getWorkflowFiles_delegatesToRepository() {
            WorkflowSession session = mock(WorkflowSession.class);
            StoredFile f = ownedFile(user(1L));
            when(storedFileRepository.findByWorkflowSession(session)).thenReturn(List.of(f));

            assertThat(service.getWorkflowFiles(session)).containsExactly(f);
        }

        @Test
        void countWorkflowStorageBytes_sumsTotalStoredBytes() {
            WorkflowSession session = mock(WorkflowSession.class);
            StoredFile a = ownedFile(user(1L));
            a.setSizeBytes(100L);
            a.setHistorySizeBytes(50L);
            a.setAuditLogSizeBytes(null); // null treated as 0
            StoredFile b = ownedFile(user(1L));
            b.setSizeBytes(10L);
            when(storedFileRepository.findByWorkflowSession(session)).thenReturn(List.of(a, b));

            assertThat(service.countWorkflowStorageBytes(session)).isEqualTo(160L);
        }

        @Test
        void countWorkflowStorageBytes_noFiles_zero() {
            WorkflowSession session = mock(WorkflowSession.class);
            when(storedFileRepository.findByWorkflowSession(session)).thenReturn(List.of());

            assertThat(service.countWorkflowStorageBytes(session)).isZero();
        }

        @Test
        void validateWorkflowDeletion_activeWorkflow_badRequest() {
            StoredFile f = ownedFile(user(1L));
            WorkflowSession session = mock(WorkflowSession.class);
            when(session.isActive()).thenReturn(true);
            f.setWorkflowSession(session);

            assertThatThrownBy(() -> service.validateWorkflowDeletion(f, user(1L)))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(FileStorageServiceGapTest.this::status)
                    .isEqualTo(400);
        }

        @Test
        void validateWorkflowDeletion_noWorkflow_passes() {
            StoredFile f = ownedFile(user(1L));

            service.validateWorkflowDeletion(f, user(1L));
        }
    }
}
