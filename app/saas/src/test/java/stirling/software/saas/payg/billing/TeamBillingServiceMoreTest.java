package stirling.software.saas.payg.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao.PriceRate;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao.SubscriptionBilling;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Branch-coverage top-up for {@link TeamBillingService}. The existing {@code
 * TeamBillingServiceTest} locks the {@code subscribed} determination; this file exercises the
 * money-cap derivation, the un-subscribed rate lookup, the bill/cap estimate helpers, the caching
 * path, and the calendar-month window seam.
 */
@ExtendWith(MockitoExtension.class)
class TeamBillingServiceMoreTest {

    private static final long TEAM_ID = 100L;

    @Mock private PaygTeamExtensionsRepository extensionsRepository;
    @Mock private WalletPolicyRepository walletPolicyRepository;
    @Mock private PricingPolicyService pricingPolicyService;
    @Mock private StripeSubscriptionDao subscriptionDao;

    private TeamBillingService service;

    @BeforeEach
    void setUp() {
        service =
                new TeamBillingService(
                        extensionsRepository,
                        walletPolicyRepository,
                        pricingPolicyService,
                        subscriptionDao);
    }

    private PaygTeamExtensions ext(String subscriptionId, long freeRemaining) {
        PaygTeamExtensions e = new PaygTeamExtensions();
        e.setTeamId(TEAM_ID);
        e.setPaygSubscriptionId(subscriptionId);
        e.setFreeUnitsRemaining(freeRemaining);
        return e;
    }

    private void stubGrant(long grant) {
        PricingPolicy policy = org.mockito.Mockito.mock(PricingPolicy.class);
        lenient().when(policy.getFreeTierUnits()).thenReturn(grant);
        lenient().when(pricingPolicyService.getEffectivePolicy(TEAM_ID)).thenReturn(policy);
    }

    @Nested
    @DisplayName("compute: subscribed window + cap")
    class SubscribedCompute {

        @Test
        @DisplayName("uses the Stripe subscription window and derives floor(cap / rate)")
        void subscribedWithMoneyCapAndRate() {
            stubGrant(500L);
            when(extensionsRepository.findById(TEAM_ID))
                    .thenReturn(Optional.of(ext("sub_1", 100L)));

            LocalDateTime start = LocalDateTime.of(2026, 6, 10, 0, 0);
            LocalDateTime end = LocalDateTime.of(2026, 7, 10, 0, 0);
            when(subscriptionDao.findBilling("sub_1"))
                    .thenReturn(
                            Optional.of(
                                    new SubscriptionBilling(
                                            start,
                                            end,
                                            "price_1",
                                            "active",
                                            "usd",
                                            new BigDecimal("2"))));
            WalletPolicy wp = new WalletPolicy();
            wp.setCapSourceMoney(1000L); // 1000 minor / rate 2 = 500 docs
            when(walletPolicyRepository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(wp));

            TeamBillingContext ctx = service.forTeam(TEAM_ID);

            assertThat(ctx.subscribed()).isTrue();
            assertThat(ctx.periodStart()).isEqualTo(start);
            assertThat(ctx.periodEnd()).isEqualTo(end);
            assertThat(ctx.perDocMinor()).isEqualByComparingTo("2");
            assertThat(ctx.currency()).isEqualTo("usd");
            assertThat(ctx.capMoneyMinor()).isEqualTo(1000L);
            assertThat(ctx.monthlyCapDocUnits()).isEqualTo(500L);
            // No un-subscribed rate lookup when subscribed.
            verify(subscriptionDao, never()).findRateByLookupKey(any(), any());
        }

        @Test
        @DisplayName("money cap but unknown rate falls back to stored cap_units")
        void subscribedMoneyCapRateUnknown_fallsBackToLegacyUnits() {
            stubGrant(500L);
            when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.of(ext("sub_1", 0L)));
            // Billing present but no usable rate (perDocMinor null).
            when(subscriptionDao.findBilling("sub_1"))
                    .thenReturn(
                            Optional.of(
                                    new SubscriptionBilling(
                                            LocalDateTime.now(),
                                            LocalDateTime.now().plusDays(30),
                                            "price_1",
                                            "active",
                                            "usd",
                                            null)));
            WalletPolicy wp = new WalletPolicy();
            wp.setCapSourceMoney(5000L);
            wp.setCapUnits(77L);
            when(walletPolicyRepository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(wp));

            TeamBillingContext ctx = service.forTeam(TEAM_ID);

            assertThat(ctx.monthlyCapDocUnits()).isEqualTo(77L);
        }

        @Test
        @DisplayName("no money cap but an admin-set cap_units still applies")
        void subscribedNoMoneyCap_usesLegacyUnits() {
            stubGrant(0L);
            when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.of(ext("sub_1", 0L)));
            when(subscriptionDao.findBilling("sub_1"))
                    .thenReturn(
                            Optional.of(
                                    new SubscriptionBilling(
                                            LocalDateTime.now(),
                                            LocalDateTime.now().plusDays(30),
                                            "price_1",
                                            "active",
                                            "usd",
                                            new BigDecimal("3"))));
            WalletPolicy wp = new WalletPolicy();
            wp.setCapSourceMoney(null);
            wp.setCapUnits(123L);
            when(walletPolicyRepository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(wp));

            TeamBillingContext ctx = service.forTeam(TEAM_ID);

            assertThat(ctx.monthlyCapDocUnits()).isEqualTo(123L);
        }
    }

    @Nested
    @DisplayName("compute: un-subscribed")
    class UnsubscribedCompute {

        @Test
        @DisplayName("resolves the display rate by lookup key and uses a calendar-month window")
        void unsubscribed_resolvesRateByLookupKey() {
            stubGrant(500L);
            when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.of(ext(null, 500L)));
            when(walletPolicyRepository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(subscriptionDao.findRateByLookupKey("plan:processor", "usd"))
                    .thenReturn(
                            Optional.of(new PriceRate("price_disp", "usd", new BigDecimal("4"))));

            TeamBillingContext ctx = service.forTeam(TEAM_ID);

            assertThat(ctx.subscribed()).isFalse();
            assertThat(ctx.perDocMinor()).isEqualByComparingTo("4");
            assertThat(ctx.currency()).isEqualTo("usd");
            // Display-only: still no enforced monthly cap for a free team.
            assertThat(ctx.monthlyCapDocUnits()).isNull();
            // Window is the calendar month.
            LocalDateTime[] expected =
                    new LocalDateTime[] {
                        YearMonth.now().atDay(1).atStartOfDay(),
                        YearMonth.now().plusMonths(1).atDay(1).atStartOfDay()
                    };
            assertThat(ctx.periodStart()).isEqualTo(expected[0]);
            assertThat(ctx.periodEnd()).isEqualTo(expected[1]);
            // Never reads a subscription window for an un-subscribed team.
            verify(subscriptionDao, never()).findBilling(any());
        }

        @Test
        @DisplayName("leaves rate null when no display price can be resolved")
        void unsubscribed_noRate_leavesNull() {
            stubGrant(500L);
            when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.of(ext(null, 500L)));
            when(walletPolicyRepository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(subscriptionDao.findRateByLookupKey("plan:processor", "usd"))
                    .thenReturn(Optional.empty());

            TeamBillingContext ctx = service.forTeam(TEAM_ID);

            assertThat(ctx.perDocMinor()).isNull();
            assertThat(ctx.currency()).isNull();
        }

        @Test
        @DisplayName("a failed effective-policy lookup degrades the grant to zero")
        void grantLookupFailure_degradesToZero() {
            when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.of(ext(null, 0L)));
            when(walletPolicyRepository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(pricingPolicyService.getEffectivePolicy(TEAM_ID))
                    .thenThrow(new IllegalStateException("no policy"));
            when(subscriptionDao.findRateByLookupKey(any(), any())).thenReturn(Optional.empty());

            TeamBillingContext ctx = service.forTeam(TEAM_ID);

            assertThat(ctx.freeGrantUnits()).isZero();
        }

        @Test
        @DisplayName("missing extension row yields zero free remaining")
        void noExtensionRow_zeroFreeRemaining() {
            stubGrant(500L);
            when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.empty());
            when(walletPolicyRepository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(subscriptionDao.findRateByLookupKey(any(), any())).thenReturn(Optional.empty());

            TeamBillingContext ctx = service.forTeam(TEAM_ID);

            assertThat(ctx.freeGrantUnits()).isEqualTo(500L);
            assertThat(ctx.freeRemainingUnits()).isZero();
            assertThat(ctx.subscriptionId()).isNull();
        }
    }

    @Nested
    @DisplayName("caching")
    class Caching {

        @Test
        @DisplayName("second forTeam call is served from cache (compute runs once)")
        void cachesPerTeam() {
            stubGrant(500L);
            when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.of(ext(null, 10L)));
            when(walletPolicyRepository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(subscriptionDao.findRateByLookupKey(any(), any())).thenReturn(Optional.empty());

            service.forTeam(TEAM_ID);
            service.forTeam(TEAM_ID);

            verify(extensionsRepository, times(1)).findById(TEAM_ID);
        }

        @Test
        @DisplayName("invalidate forces a recompute on the next call")
        void invalidateForcesRecompute() {
            stubGrant(500L);
            when(extensionsRepository.findById(TEAM_ID)).thenReturn(Optional.of(ext(null, 10L)));
            when(walletPolicyRepository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(subscriptionDao.findRateByLookupKey(any(), any())).thenReturn(Optional.empty());

            service.forTeam(TEAM_ID);
            service.invalidate(TEAM_ID);
            service.forTeam(TEAM_ID);

            verify(extensionsRepository, times(2)).findById(TEAM_ID);
        }

        @Test
        @DisplayName("invalidate(null) is a no-op")
        void invalidateNull_noOp() {
            service.invalidate(null); // must not throw
        }
    }

    @Nested
    @DisplayName("estimateBillMinor / docCapForMoney")
    class Estimates {

        private TeamBillingContext ctxWithRate(BigDecimal rate) {
            return new TeamBillingContext(
                    true,
                    "sub",
                    LocalDateTime.now(),
                    LocalDateTime.now(),
                    0L,
                    0L,
                    rate,
                    "usd",
                    null,
                    null);
        }

        @Test
        @DisplayName("estimateBillMinor multiplies paid units by the rate, rounding half-up")
        void estimateBill_rounds() {
            TeamBillingContext ctx = ctxWithRate(new BigDecimal("1.5"));
            // 3 paid × 1.5 = 4.5 → HALF_UP → 5
            assertThat(service.estimateBillMinor(ctx, 3)).contains(5L);
        }

        @Test
        @DisplayName("estimateBillMinor clamps negative paid units to zero")
        void estimateBill_clampsNegative() {
            TeamBillingContext ctx = ctxWithRate(new BigDecimal("2"));
            assertThat(service.estimateBillMinor(ctx, -10)).contains(0L);
        }

        @Test
        @DisplayName("estimateBillMinor is empty when the rate is unknown")
        void estimateBill_emptyWhenRateNull() {
            assertThat(service.estimateBillMinor(ctxWithRate(null), 5)).isEmpty();
        }

        @Test
        @DisplayName("docCapForMoney is floor(cap / rate)")
        void docCap_floors() {
            TeamBillingContext ctx = ctxWithRate(new BigDecimal("3"));
            // 1000 / 3 = 333.33 → floor 333
            assertThat(service.docCapForMoney(ctx, 1000L)).contains(333L);
        }

        @Test
        @DisplayName("docCapForMoney is empty when the rate is null or non-positive")
        void docCap_emptyWhenRateUnusable() {
            assertThat(service.docCapForMoney(ctxWithRate(null), 1000L)).isEmpty();
            assertThat(service.docCapForMoney(ctxWithRate(BigDecimal.ZERO), 1000L)).isEmpty();
            assertThat(service.docCapForMoney(ctxWithRate(new BigDecimal("-1")), 1000L)).isEmpty();
        }
    }

    @Nested
    @DisplayName("calendarMonthWindow")
    class CalendarWindow {

        @Test
        @DisplayName("returns inclusive-start / exclusive-end month bounds for a given clock")
        void boundsForFixedClock() {
            LocalDateTime now = LocalDateTime.of(2026, 2, 14, 9, 30);
            LocalDateTime[] window = TeamBillingService.calendarMonthWindow(now);
            assertThat(window[0]).isEqualTo(LocalDateTime.of(2026, 2, 1, 0, 0));
            assertThat(window[1]).isEqualTo(LocalDateTime.of(2026, 3, 1, 0, 0));
        }

        @Test
        @DisplayName("no-arg overload anchors on the current month")
        void noArgOverload() {
            LocalDateTime[] window = TeamBillingService.calendarMonthWindow();
            assertThat(window[0]).isEqualTo(YearMonth.now().atDay(1).atStartOfDay());
            assertThat(window[1]).isEqualTo(YearMonth.now().plusMonths(1).atDay(1).atStartOfDay());
        }
    }
}
