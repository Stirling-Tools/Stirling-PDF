package stirling.software.saas.procurement.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.procurement.config.ProcurementConfigurationProperties;
import stirling.software.saas.procurement.legal.AgreementAssembler;
import stirling.software.saas.procurement.legal.AgreementPdfRenderer;
import stirling.software.saas.procurement.license.EnterpriseLicenseService;
import stirling.software.saas.procurement.model.ProcurementDeal;
import stirling.software.saas.procurement.model.ProcurementQuote;
import stirling.software.saas.procurement.pricing.ProcurementPricingService;
import stirling.software.saas.procurement.repository.ProcurementActivityRepository;
import stirling.software.saas.procurement.repository.ProcurementAgreementSignatureRepository;
import stirling.software.saas.procurement.repository.ProcurementDealRepository;
import stirling.software.saas.procurement.repository.ProcurementQuoteRepository;
import stirling.software.saas.service.SaasTeamService;

class ProcurementLifecycleTest {
    private final ProcurementDealRepository deals = mock(ProcurementDealRepository.class);
    private final ProcurementQuoteRepository quotes = mock(ProcurementQuoteRepository.class);
    private final EnterpriseLicenseService licenses = mock(EnterpriseLicenseService.class);
    private final ProcurementActivityRepository audit = mock(ProcurementActivityRepository.class);
    private final TeamMembershipRepository members = mock(TeamMembershipRepository.class);
    private final TeamRepository teams = mock(TeamRepository.class);
    private final ProcurementService service =
            new ProcurementService(
                    deals,
                    quotes,
                    mock(ProcurementPricingService.class),
                    licenses,
                    new ProcurementConfigurationProperties(),
                    members,
                    mock(AgreementAssembler.class),
                    mock(AgreementPdfRenderer.class),
                    mock(ProcurementAgreementSignatureRepository.class),
                    mock(SaasTeamService.class),
                    audit,
                    teams);
    private final ProcurementDeal deal = new ProcurementDeal(7L);
    private final LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

    @BeforeEach
    void setup() {
        deal.setDealId(3L);
        when(teams.lockById(7L)).thenReturn(Optional.of(new Team()));
        when(deals.findByTeamIdForUpdate(7L)).thenReturn(Optional.of(deal));
        when(deals.save(any())).thenAnswer(call -> call.getArgument(0));
        when(deals.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void retryingAnExpiredTrialCannotRestartIt() {
        deal.setStage("trial");
        deal.setTrialStartedAt(now.minusDays(20));
        deal.setTrialEndsAt(now.minusDays(6));
        service.startTrial(7L, "cloud", 20, null, null, null, null);
        assertThat(deal.getTrialEndsAt()).isEqualTo(now.minusDays(6));
        verifyNoInteractions(licenses);
    }

    @Test
    void staffExtensionKeepsQuoteProgressAndIsAudited() {
        var user = new User();
        user.setEmail("leader@example.test");
        var member = new TeamMembership();
        member.setUser(user);
        when(members.findByTeamIdAndRole(7L, TeamRole.LEADER)).thenReturn(List.of(member));
        deal.setStage("security");
        deal.setTrialStartedAt(now.minusDays(10));
        deal.setTrialEndsAt(now.plusDays(4));
        deal.setLicenseRef("trial-key");
        service.grantTrial(7L, now.plusDays(20), "Evaluation extension", "operator");
        assertThat(deal.getStage()).isEqualTo("security");
        verify(licenses).extendLicense("trial-key", now.plusDays(20));
        verify(audit).save(any());
    }

    @Test
    void staffExtensionRepairsAMissingTrialLicenseWithoutRestartingTheTrial() {
        var user = new User();
        user.setEmail("leader@example.test");
        var member = new TeamMembership();
        member.setUser(user);
        when(members.findByTeamIdAndRole(7L, TeamRole.LEADER)).thenReturn(List.of(member));
        deal.setStage("security");
        deal.setTrialStartedAt(now.minusDays(10));
        deal.setTrialEndsAt(now.plusDays(4));
        deal.setTrialExtensionsUsed(2);
        when(licenses.issueTrialLicense(7L, "leader@example.test", now.plusDays(20)))
                .thenReturn("replacement-trial-key");

        service.grantTrial(7L, now.plusDays(20), "Evaluation extension", "operator");

        assertThat(deal.getLicenseRef()).isEqualTo("replacement-trial-key");
        assertThat(deal.getTrialStartedAt()).isEqualTo(now.minusDays(10));
        assertThat(deal.getTrialEndsAt()).isEqualTo(now.plusDays(20));
        assertThat(deal.getTrialExtensionsUsed()).isEqualTo(2);
        assertThat(deal.getStage()).isEqualTo("security");
        verify(licenses, never()).extendLicense(any(), any());
        verify(audit).save(any());
    }

    @Test
    void demoActivationWithoutADealRaisesAConflict() {
        when(deals.findByTeamIdForUpdate(7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.markLive(7L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("No deal for team 7");
        verifyNoInteractions(licenses);
    }

    @Test
    void demoActivationUsesTheLockedSubscription() {
        accepted();

        service.markLive(7L);

        assertThat(deal.getStage()).isEqualTo("active");
        assertThat(deal.getEnterprisePeriodEnd())
                .isEqualTo(deal.getEnterprisePeriodStart().plusYears(1));
        verify(deals, never()).findByTeamId(any());
    }

    @Test
    void invoicePaymentUsesPurchasedDatesAndOlderCallbacksCannotRewindThem() {
        accepted();
        var period =
                new ProcurementService.ContractPeriod(
                        "sub_1", now, now.plusYears(1), now.plusDays(30));
        service.provisionLicense(7L, period);
        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusDays(30));
        service.markLive(7L, "in_1", period);
        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusYears(1));
        service.provisionLicense(7L, period);
        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusYears(1));
        var renewal =
                new ProcurementService.ContractPeriod(
                        "sub_1", now.plusYears(1), now.plusYears(2), now.plusYears(2));
        service.markLive(7L, "in_2", renewal);
        service.markLive(7L, "in_1", period);
        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusYears(2));
        assertThat(deal.getLastPaidInvoiceId()).isEqualTo("in_2");
    }

    @Test
    void anExistingPaidAgreementCanReconcileItsMissingDates() {
        accepted();
        deal.setStage("active");
        deal.setLastPaidInvoiceId("in_existing");
        service.markLive(
                7L,
                "in_existing",
                new ProcurementService.ContractPeriod(
                        "sub_1", now, now.plusYears(1), now.plusYears(1)));
        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusYears(1));
    }

    @Test
    void callbacksMustMatchTheAcceptedSubscriptionAndQuote() {
        accepted();
        var period =
                new ProcurementService.ContractPeriod(
                        "other", now, now.plusYears(1), now.plusYears(1));
        assertThatThrownBy(() -> service.markLive(7L, "in_other", period))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.grantTrial(7L, now.plusDays(30), "Extension", "operator"))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(licenses);
    }

    @Test
    void cancellationOnlyEndsTheMatchingSubscription() {
        accepted();
        deal.setEnterpriseAccessUntil(now.plusYears(1));
        deal.setLicenseRef("paid-key");
        service.endAccess(7L, "old_subscription");
        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusYears(1));
        assertThat(deal.getTerminatedSubscriptionId()).isNull();
        service.endAccess(7L, "sub_1");
        assertThat(deal.getEnterpriseAccessUntil()).isBefore(now.plusSeconds(10));
        assertThat(deal.getTerminatedSubscriptionId()).isEqualTo("sub_1");
        verify(licenses).suspendLicense("paid-key");
    }

    @Test
    void anotherPaidInvoiceCannotReactivateTheCancelledPeriod() {
        accepted();
        var period =
                new ProcurementService.ContractPeriod(
                        "sub_1", now, now.plusYears(1), now.plusDays(30));
        service.markLive(7L, "in_original", period);
        deal.setLicenseRef("paid-key");
        service.endAccess(7L, "sub_1");
        LocalDateTime endedAt = deal.getEnterpriseAccessUntil();
        clearInvocations(licenses);

        service.markLive(7L, "in_replay", period);

        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(endedAt);
        assertThat(deal.getLastPaidInvoiceId()).isEqualTo("in_original");
        assertThat(deal.getTerminatedSubscriptionId()).isEqualTo("sub_1");
        verifyNoInteractions(licenses);
    }

    @Test
    void cancellationBeforePaymentBlocksBothProvisionAndPaidReplays() {
        accepted();
        var period =
                new ProcurementService.ContractPeriod(
                        "sub_1", now, now.plusYears(1), now.plusDays(30));
        service.provisionLicense(7L, period);
        service.endAccess(7L, "sub_1");
        LocalDateTime endedAt = deal.getEnterpriseAccessUntil();
        clearInvocations(licenses);

        service.provisionLicense(7L, period);
        service.markLive(7L, "in_late", period);

        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(endedAt);
        assertThat(deal.getStage()).isEqualTo("procurement");
        assertThat(deal.getLastPaidInvoiceId()).isNull();
        verifyNoInteractions(licenses);
    }

    @Test
    void paymentAfterAnUnpaidCutoffRestoresThePurchasedPeriod() {
        accepted();
        var period =
                new ProcurementService.ContractPeriod(
                        "sub_1", now.minusDays(40), now.plusMonths(11), now.minusDays(10));
        service.provisionLicense(7L, period);
        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.minusDays(10));

        service.markLive(7L, "in_recovered", period);

        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusMonths(11));
        assertThat(deal.getStage()).isEqualTo("active");
        assertThat(deal.getTerminatedSubscriptionId()).isNull();
    }

    @Test
    void aLaterPurchasedPeriodClearsTheTerminationMarker() {
        accepted();
        var period =
                new ProcurementService.ContractPeriod(
                        "sub_1", now, now.plusYears(1), now.plusDays(30));
        service.markLive(7L, "in_original", period);
        service.endAccess(7L, "sub_1");
        var renewal =
                new ProcurementService.ContractPeriod(
                        "sub_1", now.plusYears(1), now.plusYears(2), now.plusYears(2));

        service.markLive(7L, "in_renewal", renewal);

        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusYears(2));
        assertThat(deal.getTerminatedSubscriptionId()).isNull();
        service.markLive(7L, "in_old_replay", period);
        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusYears(2));
        assertThat(deal.getLastPaidInvoiceId()).isEqualTo("in_renewal");
    }

    @Test
    void anAcceptedReplacementSubscriptionCanUseTheSamePeriod() {
        accepted();
        var period =
                new ProcurementService.ContractPeriod(
                        "sub_1", now, now.plusYears(1), now.plusDays(30));
        service.markLive(7L, "in_original", period);
        service.endAccess(7L, "sub_1");
        deal.setSubscriptionId("sub_replacement");

        service.markLive(
                7L,
                "in_replacement",
                new ProcurementService.ContractPeriod(
                        "sub_replacement", now, now.plusYears(1), now.plusYears(1)));

        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusYears(1));
        assertThat(deal.getTerminatedSubscriptionId()).isNull();
        service.endAccess(7L, "sub_1");
        assertThat(deal.getEnterpriseAccessUntil()).isEqualTo(now.plusYears(1));
    }

    private void accepted() {
        deal.setStage("procurement");
        deal.setSubscriptionId("sub_1");
        deal.setAcceptedQuoteId(9L);
        var quote = new ProcurementQuote();
        quote.setDealId(3L);
        quote.setSeats(20);
        quote.setVolume(50000);
        when(quotes.findById(9L)).thenReturn(Optional.of(quote));
    }
}
