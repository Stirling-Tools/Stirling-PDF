package stirling.software.saas.payg.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao;

/**
 * Unit tests for {@link TeamBillingService#forTeam(Long)} — specifically the {@code subscribed}
 * determination, which is the single switch both the wallet UI ({@code status}) and the entitlement
 * gate read.
 *
 * <p>Regression focus: a team is subscribed iff {@code payg_subscription_id} is set. {@code
 * payg_unlink_subscription} nulls that column on {@code customer.subscription.deleted} but
 * deliberately keeps {@code stripe_customer_id} (for a future re-subscribe), so a cancelled team
 * must read as free again. An earlier fallback treated <em>customer-id presence</em> as subscribed,
 * which kept every team that ever subscribed pinned to subscribed forever — the cancelled-team bug
 * these tests lock down.
 */
class TeamBillingServiceTest {

    private static final long TEAM_ID = 100L;

    private PaygTeamExtensionsRepository extensionsRepository;
    private WalletPolicyRepository walletPolicyRepository;
    private PricingPolicyService pricingPolicyService;
    private StripeSubscriptionDao subscriptionDao;
    private TeamBillingService service;

    @BeforeEach
    void setUp() {
        extensionsRepository = Mockito.mock(PaygTeamExtensionsRepository.class);
        walletPolicyRepository = Mockito.mock(WalletPolicyRepository.class);
        pricingPolicyService = Mockito.mock(PricingPolicyService.class);
        subscriptionDao = Mockito.mock(StripeSubscriptionDao.class);
        service =
                new TeamBillingService(
                        extensionsRepository,
                        walletPolicyRepository,
                        pricingPolicyService,
                        subscriptionDao);

        // Default grant so the free-tier fields are populated; individual tests don't depend on it
        // beyond the cancelled-team case below, which asserts the grant survives.
        PricingPolicy policy = Mockito.mock(PricingPolicy.class);
        when(policy.getFreeTierUnits()).thenReturn(500L);
        when(pricingPolicyService.getEffectivePolicy(TEAM_ID)).thenReturn(policy);
    }

    private PaygTeamExtensions ext(String subscriptionId, String customerId, long freeRemaining) {
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(TEAM_ID);
        ext.setPaygSubscriptionId(subscriptionId);
        ext.setStripeCustomerId(customerId);
        ext.setFreeUnitsRemaining(freeRemaining);
        return ext;
    }

    @Test
    void subscribed_whenSubscriptionIdPresent() {
        when(extensionsRepository.findById(TEAM_ID))
                .thenReturn(Optional.of(ext("sub_123", "cus_123", 0L)));

        TeamBillingContext ctx = service.forTeam(TEAM_ID);

        assertThat(ctx.subscribed()).isTrue();
        assertThat(ctx.subscriptionId()).isEqualTo("sub_123");
    }

    /**
     * The cancelled-subscription regression: after {@code payg_unlink_subscription} the
     * subscription id is null but the Stripe customer id remains. The team must read as NOT
     * subscribed (drops to the free-grant gate), and must still surface its remaining free grant.
     */
    @Test
    void notSubscribed_afterCancellation_whenOnlyCustomerIdRemains() {
        when(extensionsRepository.findById(TEAM_ID))
                .thenReturn(Optional.of(ext(null, "cus_123", 120L)));

        TeamBillingContext ctx = service.forTeam(TEAM_ID);

        assertThat(ctx.subscribed()).isFalse();
        assertThat(ctx.subscriptionId()).isNull();
        // The free grant survives cancellation and is what now gates the team.
        assertThat(ctx.freeGrantUnits()).isEqualTo(500L);
        assertThat(ctx.freeRemainingUnits()).isEqualTo(120L);
        // Not subscribed → no monthly paid-doc cap.
        assertThat(ctx.monthlyCapDocUnits()).isNull();
    }

    @Test
    void notSubscribed_whenNoSubscriptionAndNoCustomer() {
        when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.of(ext(null, null, 500L)));

        TeamBillingContext ctx = service.forTeam(TEAM_ID);

        assertThat(ctx.subscribed()).isFalse();
        assertThat(ctx.subscriptionId()).isNull();
    }

    @Test
    void notSubscribed_whenNoExtensionRow() {
        when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.empty());

        TeamBillingContext ctx = service.forTeam(TEAM_ID);

        assertThat(ctx.subscribed()).isFalse();
        assertThat(ctx.subscriptionId()).isNull();
    }
}
