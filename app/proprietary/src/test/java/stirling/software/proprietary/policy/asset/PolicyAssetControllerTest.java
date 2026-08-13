package stirling.software.proprietary.policy.asset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;

@ExtendWith(MockitoExtension.class)
@DisplayName("PolicyAssetController")
class PolicyAssetControllerTest {

    @Mock private PolicyAccessGuard policyAccessGuard;
    @Mock private PolicyManagementAuthority policyManagementAuthority;

    private final PolicyAssetStore assetStore = new InProcessPolicyAssetStore();
    private final PolicyStore policyStore = new InProcessPolicyStore();
    private ApplicationProperties applicationProperties;
    private PolicyAssetController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        controller =
                new PolicyAssetController(
                        assetStore,
                        policyStore,
                        policyAccessGuard,
                        policyManagementAuthority,
                        applicationProperties);
    }

    @Nested
    @DisplayName("upload")
    class Upload {

        @Test
        void stampsTheCallersOwnerAndTeamAndTheActualByteLength() throws Exception {
            // Owner/team come from the guard, never the request: a client cannot forge either.
            applicationProperties.getSecurity().setEnableLogin(false);
            when(policyAccessGuard.ownerForNewPolicy()).thenReturn("lead@example.com");
            when(policyAccessGuard.teamForNewPolicy()).thenReturn(7L);

            PolicyAsset saved = controller.upload(file("logo.png", "image/png", "abcd")).getBody();

            assertThat(saved).isNotNull();
            assertThat(saved.id()).isNotBlank();
            assertThat(saved.owner()).isEqualTo("lead@example.com");
            assertThat(saved.teamId()).isEqualTo(7L);
            assertThat(saved.size()).isEqualTo(4);
        }

        @Test
        void stripsAnyPathFromTheSuppliedFilename() throws Exception {
            applicationProperties.getSecurity().setEnableLogin(false);

            PolicyAsset saved =
                    controller.upload(file("../../etc/passwd", "text/plain", "x")).getBody();

            assertThat(saved).isNotNull();
            assertThat(saved.fileName()).isEqualTo("passwd");
        }

        @Test
        void rejectsAnEmptyUpload() {
            applicationProperties.getSecurity().setEnableLogin(false);

            assertThatThrownBy(() -> controller.upload(file("empty.png", "image/png", "")))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void rejectsANonLeaderWhenLoginIsEnabled() {
            applicationProperties.getSecurity().setEnableLogin(true);
            when(policyManagementAuthority.canEditPolicies()).thenReturn(false);

            assertThatThrownBy(() -> controller.upload(file("c.p12", null, "x")))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }
    }

    @Nested
    @DisplayName("content")
    class Content {

        @Test
        void needsTheSameAuthorityAsUploading() {
            // Supporting files include signing certificates: reading the bytes back is gated on
            // who may manage policies, not merely on team membership.
            applicationProperties.getSecurity().setEnableLogin(true);
            when(policyManagementAuthority.canEditPolicies()).thenReturn(false);
            PolicyAsset asset = store("cert.p12", 7L, "secret");

            assertThatThrownBy(() -> controller.content(asset.id()))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void readsAnotherTeamsAssetAsNotFound() {
            applicationProperties.getSecurity().setEnableLogin(true);
            when(policyManagementAuthority.canEditPolicies()).thenReturn(true);
            PolicyAsset asset = store("cert.p12", 9L, "secret");
            when(policyAccessGuard.canAccess(asset)).thenReturn(false);

            assertThatThrownBy(() -> controller.content(asset.id()))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void encodesANonAsciiFilenameInTheContentDispositionHeader() {
            applicationProperties.getSecurity().setEnableLogin(false);
            PolicyAsset asset = store("café.png", null, "bytes");
            when(policyAccessGuard.canAccess(asset)).thenReturn(true);

            String disposition =
                    controller
                            .content(asset.id())
                            .getHeaders()
                            .getFirst(HttpHeaders.CONTENT_DISPOSITION);

            // RFC 5987 form, not the raw non-ASCII byte that would mangle in the header.
            assertThat(disposition).contains("filename*=UTF-8''caf%C3%A9.png");
        }

        @Test
        void fallsBackToOctetStreamForAnUnparsableStoredContentType() {
            applicationProperties.getSecurity().setEnableLogin(false);
            PolicyAsset asset =
                    assetStore.save(
                            new PolicyAsset(null, "x.bin", "not/a/media/type", 0, null, null, 1L),
                            "bytes".getBytes());
            when(policyAccessGuard.canAccess(asset)).thenReturn(true);

            assertThat(controller.content(asset.id()).getHeaders().getContentType())
                    .hasToString("application/octet-stream");
        }
    }

    @Nested
    @DisplayName("delete")
    class Delete {

        @Test
        void refusesWhileAPipelineStepStillReferencesTheAsset() {
            applicationProperties.getSecurity().setEnableLogin(false);
            PolicyAsset asset = store("stamp.png", null, "bytes");
            when(policyAccessGuard.canAccess(asset)).thenReturn(true);
            policyStore.save(policyBinding(asset.id()));
            when(policyAccessGuard.visibleFrom(policyStore))
                    .thenReturn(policyStore.findByTeam(null));

            assertThatThrownBy(() -> controller.delete(asset.id()))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.CONFLICT);
            assertThat(assetStore.get(asset.id())).isPresent();
        }

        @Test
        void removesAnAssetNoStepReferences() {
            applicationProperties.getSecurity().setEnableLogin(false);
            PolicyAsset asset = store("old.png", null, "bytes");
            when(policyAccessGuard.canAccess(asset)).thenReturn(true);
            when(policyAccessGuard.visibleFrom(policyStore)).thenReturn(List.of());

            assertThat(controller.delete(asset.id()).getStatusCode())
                    .isEqualTo(HttpStatus.NO_CONTENT);
            assertThat(assetStore.get(asset.id())).isEmpty();
        }

        @Test
        void seesOneIdInsideAMultiFileBindingAsStillReferenced() {
            // A field carrying several files stores its ids comma-joined; each one still counts.
            applicationProperties.getSecurity().setEnableLogin(false);
            PolicyAsset first = store("a.pdf", null, "a");
            PolicyAsset second = store("b.pdf", null, "b");
            when(policyAccessGuard.canAccess(second)).thenReturn(true);
            policyStore.save(policyBinding(first.id() + "," + second.id()));
            when(policyAccessGuard.visibleFrom(policyStore))
                    .thenReturn(policyStore.findByTeam(null));

            assertThatThrownBy(() -> controller.delete(second.id()))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.CONFLICT);
        }
    }

    private PolicyAsset store(String fileName, Long teamId, String content) {
        return assetStore.save(
                new PolicyAsset(null, fileName, null, 0, null, teamId, 1L), content.getBytes());
    }

    private static Policy policyBinding(String assetIds) {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                List.of(PipelineInput.manual("s1")),
                List.of(
                        new PipelineStep(
                                "/api/v1/security/cert-sign",
                                Map.of(),
                                Map.of("certFile", PolicyAssetRefs.PREFIX + assetIds))),
                OutputSpec.inline());
    }

    private static MockMultipartFile file(String name, String contentType, String content) {
        return new MockMultipartFile("file", name, contentType, content.getBytes());
    }
}
