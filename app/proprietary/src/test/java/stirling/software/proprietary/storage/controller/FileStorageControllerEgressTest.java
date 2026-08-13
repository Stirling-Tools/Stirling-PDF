package stirling.software.proprietary.storage.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.storage.egress.ShareEgressDecision;
import stirling.software.proprietary.storage.egress.ShareEgressProcessor;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.service.FileStorageService;

/** The delivery half: what the download endpoints do once a policy has decided. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FileStorageControllerEgressTest {

    private static final String TOKEN = "tok";
    private static final String STORAGE_KEY = "11/abc-doc.pdf";

    @Mock private FileStorageService fileStorageService;
    @Mock private StorageProvider storageProvider;
    @Mock private ShareEgressProcessor shareEgressProcessor;
    @Mock private AuditService auditService;

    private FileStorageController controller;
    private StoredFile file;
    private FileShare share;
    private Authentication authentication;

    @BeforeEach
    void setUp() {
        controller =
                new FileStorageController(
                        fileStorageService, storageProvider, shareEgressProcessor, auditService);
        file = storedFile();
        share = new FileShare();
        share.setFile(file);
        share.setShareToken(TOKEN);
        share.setAccessRole(ShareAccessRole.VIEWER);
        authentication = new UsernamePasswordAuthenticationToken(recipient(), "n/a", List.of());

        when(fileStorageService.getShareByToken(TOKEN)).thenReturn(share);
        when(fileStorageService.canAccessShareLink(share, authentication)).thenReturn(true);
        when(fileStorageService.loadFile(file)).thenReturn(new ByteArrayResource(new byte[] {1}));
    }

    @Test
    void aViewOnlyPolicyNeverServesAnAttachment() {
        when(fileStorageService.decideDelivery(eq(share), any())).thenReturn(viewOnly());
        when(shareEgressProcessor.resolve(eq(share), any(), any()))
                .thenReturn(new ByteArrayResource(new byte[] {7}));

        // Asking for an attachment is a client hint; the policy decides the disposition.
        ResponseEntity<Resource> response =
                controller.downloadShareLink(TOKEN, authentication, false);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentDisposition().isInline()).isTrue();
    }

    @Test
    void aViewOnlyDeliveryIsProcessedWhicheverDispositionIsAskedFor() {
        ShareEgressDecision decision = viewOnly();
        when(fileStorageService.decideDelivery(eq(share), any())).thenReturn(decision);
        when(shareEgressProcessor.resolve(eq(share), any(), eq(decision)))
                .thenReturn(new ByteArrayResource(new byte[] {7}));

        // The bypass this closes: ?inline=true used to skip the gate and hand back the original.
        controller.downloadShareLink(TOKEN, authentication, true);

        verify(shareEgressProcessor).resolve(eq(share), any(), eq(decision));
    }

    @Test
    void aRefusedDeliveryIsNotRecordedAsAnAccess() {
        when(fileStorageService.decideDelivery(eq(share), any())).thenReturn(blocked());

        assertThatThrownBy(() -> controller.downloadShareLink(TOKEN, authentication, false))
                .isInstanceOf(ResponseStatusException.class);

        // Otherwise the owner's access log would show a view that never happened.
        verify(fileStorageService, never()).recordShareAccess(any(), any(), anyBoolean());
    }

    @Test
    void aViewOnlyAccessIsLoggedAsAViewNotADownload() {
        when(fileStorageService.decideDelivery(eq(share), any())).thenReturn(viewOnly());
        when(shareEgressProcessor.resolve(eq(share), any(), any()))
                .thenReturn(new ByteArrayResource(new byte[] {7}));

        controller.downloadShareLink(TOKEN, authentication, false);

        verify(fileStorageService).recordShareAccess(share, authentication, true);
    }

    @Test
    void aGovernedDeliveryNeverRedirectsToASignedUrl() throws Exception {
        when(fileStorageService.decideDelivery(eq(share), any())).thenReturn(viewOnly());
        when(shareEgressProcessor.resolve(eq(share), any(), any()))
                .thenReturn(new ByteArrayResource(new byte[] {7}));
        when(storageProvider.signedDownloadUrl(
                        eq(STORAGE_KEY), any(Duration.class), anyBoolean(), anyString()))
                .thenReturn(Optional.of(URI.create("https://bucket.example/signed")));

        ResponseEntity<Resource> response =
                controller.downloadShareLink(TOKEN, authentication, true);

        // A signed URL points straight at the stored object, so it would hand over the unprocessed
        // document and ignore the view-only disposition.
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
    }

    @Test
    void aTransformingPolicyServesTheProcessedCopy() {
        ShareEgressDecision decision = transforming();
        byte[] processed = new byte[] {1, 2, 3, 4, 5};
        when(fileStorageService.decideDelivery(eq(share), any())).thenReturn(decision);
        when(shareEgressProcessor.resolve(eq(share), any(), eq(decision)))
                .thenReturn(new ByteArrayResource(processed));

        ResponseEntity<Resource> response =
                controller.downloadShareLink(TOKEN, authentication, false);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isInstanceOf(ByteArrayResource.class);
        // The header must describe the copy actually served, not the stored original.
        assertThat(response.getHeaders().getContentLength()).isEqualTo(processed.length);
    }

    @Test
    void anUngovernedDeliveryIsLeftExactlyAsItWas() {
        when(fileStorageService.decideDelivery(eq(share), any()))
                .thenReturn(ShareEgressDecision.unrestricted(ShareAccessRole.VIEWER));

        ResponseEntity<Resource> response =
                controller.downloadShareLink(TOKEN, authentication, false);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verifyNoInteractions(shareEgressProcessor);
    }

    @Test
    void anOwnerDownloadingTheirOwnFileIsNotEgress() {
        User owner = ownerUser();
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(owner);
        when(fileStorageService.getAccessibleFile(owner, 77L)).thenReturn(file);
        when(fileStorageService.findUserShare(owner, file)).thenReturn(Optional.empty());

        controller.downloadFile(77L, false);

        verify(fileStorageService, never()).decideDelivery(any(), any());
        verifyNoInteractions(shareEgressProcessor);
    }

    @Test
    void aRecipientDownloadingAFileSharedWithThemIsEgress() {
        User user = recipient();
        ShareEgressDecision decision = transforming();
        FileShare userShare = new FileShare();
        userShare.setFile(file);
        userShare.setSharedWithUser(user);
        userShare.setAccessRole(ShareAccessRole.VIEWER);
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(user);
        when(fileStorageService.getAccessibleFile(user, 77L)).thenReturn(file);
        when(fileStorageService.findUserShare(user, file)).thenReturn(Optional.of(userShare));
        when(fileStorageService.decideDelivery(eq(userShare), any())).thenReturn(decision);
        when(shareEgressProcessor.resolve(eq(userShare), any(), eq(decision)))
                .thenReturn(new ByteArrayResource(new byte[] {9}));

        ResponseEntity<Resource> response = controller.downloadFile(77L, false);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(shareEgressProcessor).resolve(eq(userShare), any(), eq(decision));
        // Direct downloads are not share-link accesses, so nothing is logged against a token.
        verify(fileStorageService, never()).recordShareAccess(any(), any(), anyBoolean());
    }

    @Test
    void twoDifferentRecipientsOnOneLinkAreBothServed() {
        ShareEgressDecision decision = transforming();
        Authentication second =
                new UsernamePasswordAuthenticationToken(secondRecipient(), "n/a", List.of());
        when(fileStorageService.canAccessShareLink(share, second)).thenReturn(true);
        when(fileStorageService.decideDelivery(eq(share), any())).thenReturn(decision);
        when(shareEgressProcessor.resolve(eq(share), any(), eq(decision)))
                .thenReturn(new ByteArrayResource(new byte[] {9}));

        assertThat(controller.downloadShareLink(TOKEN, authentication, false).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        // The processed copy is cached against the share, so the second identity reads a copy the
        // first one's run produced.
        assertThat(controller.downloadShareLink(TOKEN, second, false).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    private static User secondRecipient() {
        User user = new User();
        user.setId(33L);
        user.setUsername("carol@partner.com");
        return user;
    }

    private static ShareEgressDecision viewOnly() {
        return new ShareEgressDecision(
                true,
                null,
                ShareAccessRole.VIEWER,
                1,
                true,
                true,
                "policy-1",
                "Sharing Policy",
                List.of(),
                null);
    }

    private static ShareEgressDecision blocked() {
        return new ShareEgressDecision(
                false,
                "This document may not be shared outside your organisation",
                null,
                null,
                false,
                true,
                "policy-1",
                "Sharing Policy",
                List.of(),
                null);
    }

    private static ShareEgressDecision transforming() {
        return new ShareEgressDecision(
                true,
                null,
                ShareAccessRole.VIEWER,
                null,
                false,
                false,
                "policy-1",
                "Sharing Policy",
                List.of("policy-1"),
                "fingerprint");
    }

    private static User ownerUser() {
        User user = new User();
        user.setId(11L);
        user.setUsername("alice@example.com");
        return user;
    }

    private static User recipient() {
        User user = new User();
        user.setId(22L);
        user.setUsername("bob@partner.com");
        return user;
    }

    private static StoredFile storedFile() {
        StoredFile file = new StoredFile();
        file.setId(77L);
        file.setOwner(ownerUser());
        file.setOriginalFilename("doc.pdf");
        file.setContentType("application/pdf");
        file.setSizeBytes(123L);
        file.setStorageKey(STORAGE_KEY);
        return file;
    }
}
