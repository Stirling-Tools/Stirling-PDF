package stirling.software.saas.store;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.security.TeamSecurityExpressions;
import stirling.software.saas.store.moderation.StoreContentCheck;

import tools.jackson.databind.ObjectMapper;

/** The owner's details edit: words change, the tool chain and the publish history do not. */
class StoreServiceDetailsTest {

    private static final long TEAM = 7L;
    private static final LocalDateTime PUBLISHED = LocalDateTime.of(2026, 9, 1, 10, 0);

    private final ObjectMapper mapper = new ObjectMapper();
    private final StoreListingRepository listings = mock(StoreListingRepository.class);
    private final PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
    private final TeamSecurityExpressions teamSecurity = mock(TeamSecurityExpressions.class);
    private StoreService service;
    private StoreListing listing;

    @BeforeEach
    void setUp() {
        service =
                new StoreService(
                        listings,
                        mock(StoreStarRepository.class),
                        mock(StoreInstallRepository.class),
                        mock(PolicyStore.class),
                        mock(PolicyAccessGuard.class),
                        authority,
                        mock(PolicyValidator.class),
                        mock(SourceStore.class),
                        teamSecurity,
                        mock(TeamMembershipRepository.class),
                        mock(UserRepository.class),
                        new StoreManifestSanitizer(),
                        new StoreTextAuditor(BlockedWordList.of(List.of(), List.of())),
                        mapper,
                        StoreContentCheck.disabled());
        when(authority.canEditPolicies()).thenReturn(true);
        when(teamSecurity.currentUserTeamId()).thenReturn(TEAM);
        when(teamSecurity.currentUserId()).thenReturn(42L);

        StoreManifest manifest =
                new StoreManifest(
                        StoreManifest.SCHEMA_VERSION,
                        "Invoice intake",
                        "Makes scanned invoices searchable and small.",
                        "ingestion",
                        "route",
                        List.of(
                                new StoreManifest.Step(
                                        "/api/v1/misc/ocr-pdf", Map.of("languages", "eng"))),
                        List.of(StoreManifest.RequiredOnInstall.source()),
                        null,
                        null);
        listing = new StoreListing();
        listing.setId(1L);
        listing.setStoreId("sp-abcd1234");
        listing.setPublisherTeamId(TEAM);
        listing.setName(manifest.name());
        listing.setSlug(StoreIds.slugify(manifest.name()));
        listing.setDescription(manifest.description());
        listing.setCategory(manifest.category());
        listing.setManifestJson(mapper.writeValueAsString(manifest));
        listing.setStatus(StoreListing.Status.LISTED);
        listing.setPublishedAt(PUBLISHED);
        listing.setCreatedAt(PUBLISHED);
        when(listings.findByStoreId("sp-abcd1234")).thenReturn(Optional.of(listing));
        when(listings.save(any())).thenAnswer(i -> i.getArgument(0));
    }

    @Test
    void editChangesTheWordsAndKeepsTheChain() {
        StoreDtos.ListingDetail detail =
                service.updateDetails(
                        "sp-abcd1234",
                        new StoreDtos.DetailsRequest(
                                "Invoice intake and compress",
                                "Makes scanned invoices searchable, then shrinks them.",
                                "Compliance",
                                "Now compresses after OCR."));

        assertThat(detail.name()).isEqualTo("Invoice intake and compress");
        assertThat(detail.category()).isEqualTo("compliance");
        assertThat(detail.latestChange()).isEqualTo("Now compresses after OCR.");
        assertThat(detail.steps())
                .extracting(StoreManifest.Step::operation)
                .containsExactly("/api/v1/misc/ocr-pdf");
        assertThat(listing.getPublishedAt()).isEqualTo(PUBLISHED);
        assertThat(listing.getSlug()).isEqualTo("invoice-intake-and-compress");
        StoreManifest stored = mapper.readValue(listing.getManifestJson(), StoreManifest.class);
        assertThat(stored.description())
                .isEqualTo("Makes scanned invoices searchable, then shrinks them.");
    }

    @Test
    void blockedWordsAreRefusedWithTheReport() {
        assertThatThrownBy(
                        () ->
                                service.updateDetails(
                                        "sp-abcd1234",
                                        new StoreDtos.DetailsRequest(
                                                "Official invoice intake",
                                                "Mail someone@example.com for the settings.",
                                                "ingestion",
                                                null)))
                .isInstanceOfSatisfying(
                        StoreService.PublishBlockedException.class,
                        e ->
                                assertThat(e.getReport().findings())
                                        .extracting(StoreFinding::code)
                                        .contains("reserved-word", "email-in-text"));
        verify(listings, never()).save(any());
    }

    @Test
    void anotherTeamsListingIsNotFound() {
        listing.setPublisherTeamId(99L);

        assertThatThrownBy(
                        () ->
                                service.updateDetails(
                                        "sp-abcd1234",
                                        new StoreDtos.DetailsRequest(
                                                "Invoice intake",
                                                "Makes scanned invoices searchable and small.",
                                                "ingestion",
                                                null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }
}
