package stirling.software.saas.payg.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.saas.payg.api.WalletSnapshotResponse.ActivityRow;
import stirling.software.saas.payg.api.WalletSnapshotResponse.CategoryBreakdown;
import stirling.software.saas.payg.api.WalletSnapshotResponse.MemberRow;

/** Accessor + value-semantics tests for {@link WalletSnapshotResponse} and its nested records. */
class WalletSnapshotResponseTest {

    private static WalletSnapshotResponse sample() {
        return new WalletSnapshotResponse(
                7L,
                "subscribed",
                "leader",
                "2026-06-01",
                "2026-07-01",
                /* billableUsed= */ 12,
                /* billableLimit= */ 100,
                /* freeAllowance= */ 500,
                /* freeRemaining= */ 488,
                new BigDecimal("1.5"),
                "usd",
                /* estimatedBillMinor= */ 1800L,
                /* capUsd= */ 25,
                /* noCap= */ false,
                "sub_123",
                /* spendUnitsThisPeriod= */ 12,
                new CategoryBreakdown(5, 4, 3),
                List.of(new MemberRow("u1", "Ann", "ann@example.com", 8)),
                List.of(new ActivityRow(1L, "api", "API usage", "2026-06-02T10:00", 4)));
    }

    @Test
    @DisplayName("top-level accessors round-trip every component")
    void topLevelAccessors() {
        WalletSnapshotResponse r = sample();
        assertThat(r.teamId()).isEqualTo(7L);
        assertThat(r.status()).isEqualTo("subscribed");
        assertThat(r.role()).isEqualTo("leader");
        assertThat(r.billingPeriodStart()).isEqualTo("2026-06-01");
        assertThat(r.billingPeriodEnd()).isEqualTo("2026-07-01");
        assertThat(r.billableUsed()).isEqualTo(12);
        assertThat(r.billableLimit()).isEqualTo(100);
        assertThat(r.freeAllowance()).isEqualTo(500);
        assertThat(r.freeRemaining()).isEqualTo(488);
        assertThat(r.pricePerDocMinor()).isEqualByComparingTo("1.5");
        assertThat(r.currency()).isEqualTo("usd");
        assertThat(r.estimatedBillMinor()).isEqualTo(1800L);
        assertThat(r.capUsd()).isEqualTo(25);
        assertThat(r.noCap()).isFalse();
        assertThat(r.stripeSubscriptionId()).isEqualTo("sub_123");
        assertThat(r.spendUnitsThisPeriod()).isEqualTo(12);
    }

    @Test
    @DisplayName("nested records expose their fields")
    void nestedAccessors() {
        WalletSnapshotResponse r = sample();

        CategoryBreakdown cb = r.categoryBreakdown();
        assertThat(cb.api()).isEqualTo(5);
        assertThat(cb.ai()).isEqualTo(4);
        assertThat(cb.automation()).isEqualTo(3);

        MemberRow member = r.members().get(0);
        assertThat(member.userId()).isEqualTo("u1");
        assertThat(member.name()).isEqualTo("Ann");
        assertThat(member.email()).isEqualTo("ann@example.com");
        assertThat(member.spendUnits()).isEqualTo(8);

        ActivityRow activity = r.recent().get(0);
        assertThat(activity.id()).isEqualTo(1L);
        assertThat(activity.kind()).isEqualTo("api");
        assertThat(activity.label()).isEqualTo("API usage");
        assertThat(activity.ts()).isEqualTo("2026-06-02T10:00");
        assertThat(activity.docUnits()).isEqualTo(4);
    }

    @Test
    @DisplayName("nullable fields are permitted for the free / unresolved case")
    void nullableFields() {
        WalletSnapshotResponse free =
                new WalletSnapshotResponse(
                        7L,
                        "free",
                        "member",
                        "2026-06-01",
                        "2026-07-01",
                        0,
                        null,
                        500,
                        500,
                        null,
                        null,
                        null,
                        null,
                        false,
                        null,
                        0,
                        new CategoryBreakdown(0, 0, 0),
                        List.of(),
                        List.of());

        assertThat(free.billableLimit()).isNull();
        assertThat(free.pricePerDocMinor()).isNull();
        assertThat(free.currency()).isNull();
        assertThat(free.estimatedBillMinor()).isNull();
        assertThat(free.capUsd()).isNull();
        assertThat(free.stripeSubscriptionId()).isNull();
        assertThat(free.members()).isEmpty();
    }

    @Test
    @DisplayName("equal values produce equal records")
    void valueSemantics() {
        assertThat(sample()).isEqualTo(sample()).hasSameHashCodeAs(sample());
        assertThat(new CategoryBreakdown(1, 2, 3)).isEqualTo(new CategoryBreakdown(1, 2, 3));
        assertThat(new MemberRow("u", "n", "e", 1)).isEqualTo(new MemberRow("u", "n", "e", 1));
        assertThat(new ActivityRow(1L, "k", "l", "t", 2))
                .isEqualTo(new ActivityRow(1L, "k", "l", "t", 2));
    }
}
