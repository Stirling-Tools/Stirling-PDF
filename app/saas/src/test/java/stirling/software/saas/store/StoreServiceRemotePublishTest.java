package stirling.software.saas.store;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.security.TeamSecurityExpressions;

import tools.jackson.databind.ObjectMapper;

/**
 * Publishing from a linked self-hosted server: the pipeline is not stored here, so it arrives in
 * the request and goes through the same sanitiser, and the link is left for that server to keep.
 */
class StoreServiceRemotePublishTest {

    private static final long TEAM = 7L;

    private final StoreListingRepository listings = mock(StoreListingRepository.class);
    private final PolicyStore policyStore = mock(PolicyStore.class);
    private final PolicyAccessGuard accessGuard = mock(PolicyAccessGuard.class);
    private StoreService service;

    @BeforeEach
    void setUp() {
        PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
        TeamSecurityExpressions teamSecurity = mock(TeamSecurityExpressions.class);
        service =
                new StoreService(
                        listings,
                        mock(StoreStarRepository.class),
                        mock(StoreInstallRepository.class),
                        policyStore,
                        accessGuard,
                        authority,
                        mock(PolicyValidator.class),
                        mock(SourceStore.class),
                        teamSecurity,
                        mock(TeamMembershipRepository.class),
                        mock(UserRepository.class),
                        new StoreManifestSanitizer(),
                        new StoreTextAuditor(BlockedWordList.of(List.of(), List.of())),
                        new ObjectMapper());
        when(authority.canEditPolicies()).thenReturn(true);
        when(teamSecurity.currentUserTeamId()).thenReturn(TEAM);
        when(teamSecurity.currentUserId()).thenReturn(42L);
        when(listings.findByStoreId(any())).thenReturn(Optional.empty());
        when(listings.save(any())).thenAnswer(i -> i.getArgument(0));
    }

    /**
     * What a self-hosted server's store-export sends: secrets blanked, ids that mean nothing here.
     */
    private static Policy exported() {
        return new Policy(
                "local-uuid",
                "Lock and shrink",
                "admin",
                false,
                List.of(PipelineInput.manual("local-source")),
                List.of(
                        new PipelineStep(
                                "/api/v1/security/add-password",
                                Map.of("password", "", "keyLength", 256),
                                Map.of()),
                        new PipelineStep(
                                "/api/v1/misc/compress-pdf", Map.of("optimizeLevel", 2), Map.of())),
                OutputSpec.inline(),
                List.of("local-destination"),
                null);
    }

    private static PublishRequest request(Policy policy) {
        return new PublishRequest(
                "local-uuid",
                "Lock and shrink",
                "Locks each document with a password, then shrinks it.",
                "security",
                null,
                policy);
    }

    @Test
    void aSelfHostedPipelineIsCheckedLikeAStoredOne() {
        when(policyStore.get("local-uuid")).thenReturn(Optional.empty());

        PreflightReport report = service.preflight(request(exported()));

        assertThat(report.canPublish()).isTrue();
        assertThat(report.findings())
                .extracting(StoreFinding::code)
                .contains("secret-cleared", "source-removed", "destination-removed");
        // Its sources are not known here, so they are not named by an id the publisher never saw.
        assertThat(report.findings())
                .filteredOn(f -> f.code().equals("source-removed"))
                .extracting(StoreFinding::title)
                .containsExactly("Source left out");
        assertThat(report.manifest().steps().get(0).parameters())
                .doesNotContainKey("password")
                .containsEntry("keyLength", 256);
        assertThat(report.manifest().requiredOnInstall())
                .anySatisfy(r -> assertThat(r.field()).isEqualTo("password"));
    }

    @Test
    void publishingItLeavesTheLinkToTheServerItCameFrom() {
        when(policyStore.get("local-uuid")).thenReturn(Optional.empty());

        StoreDtos.ListingDetail listing = service.publish(request(exported()));

        assertThat(listing.storeId()).startsWith("sp-");
        verify(policyStore, never()).save(any());
    }

    @Test
    void aStoredPipelineWinsOverOneInTheRequest() {
        Policy stored =
                new Policy(
                        "local-uuid",
                        "Stored",
                        "owner",
                        false,
                        List.of(),
                        List.of(new PipelineStep("/api/v1/misc/flatten", Map.of(), Map.of())),
                        OutputSpec.inline(),
                        List.of(),
                        TEAM);
        when(policyStore.get("local-uuid")).thenReturn(Optional.of(stored));
        when(accessGuard.canAccess(stored)).thenReturn(true);

        PreflightReport report = service.preflight(request(exported()));

        assertThat(report.manifest().steps())
                .extracting(StoreManifest.Step::operation)
                .containsExactly("/api/v1/misc/flatten");
    }
}
