package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.mockito.Mockito;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;

/**
 * Contract: daily bucket must be checked before hourly. A rejected fixed-window consume still
 * increments the counter with no rollback, so doing hourly first would burn a token the caller
 * never received value for when daily rejects.
 */
class RateLimitServiceTest {

    private RateLimitStore store;
    private RateLimitService service;

    @BeforeEach
    void setUp() {
        store = Mockito.mock(RateLimitStore.class);
        service = new RateLimitService(store);
    }

    private RateLimitDecision allowed() {
        return new RateLimitDecision(true, 5L, 0L);
    }

    private RateLimitDecision denied() {
        return new RateLimitDecision(false, 0L, Duration.ofMinutes(15).toNanos());
    }

    @Test
    void allowsInvitation_whenBothBucketsHaveCapacity() {
        when(store.tryConsume(startsWith("invite:day:"), eq(150L), eq(Duration.ofDays(1))))
                .thenReturn(allowed());
        when(store.tryConsume(startsWith("invite:hour:"), eq(50L), eq(Duration.ofHours(1))))
                .thenReturn(allowed());

        assertThat(service.allowInvitation(42L)).isTrue();

        InOrder order = inOrder(store);
        // Daily MUST be checked before hourly.
        order.verify(store).tryConsume(startsWith("invite:day:"), eq(150L), eq(Duration.ofDays(1)));
        order.verify(store)
                .tryConsume(startsWith("invite:hour:"), eq(50L), eq(Duration.ofHours(1)));
    }

    @Test
    void dailyRejected_neverConsumesHourly() {
        when(store.tryConsume(startsWith("invite:day:"), anyLong(), any(Duration.class)))
                .thenReturn(denied());

        assertThat(service.allowInvitation(42L)).isFalse();

        verify(store, times(1))
                .tryConsume(startsWith("invite:day:"), anyLong(), any(Duration.class));
        // Critical: hourly bucket is NEVER touched on a daily rejection. Otherwise rejected
        // calls would burn hourly tokens that the team could have used next hour.
        verify(store, never())
                .tryConsume(startsWith("invite:hour:"), anyLong(), any(Duration.class));
    }

    @Test
    void hourlyRejected_afterDailyAllowed_returnsFalse() {
        when(store.tryConsume(startsWith("invite:day:"), anyLong(), any(Duration.class)))
                .thenReturn(allowed());
        when(store.tryConsume(startsWith("invite:hour:"), anyLong(), any(Duration.class)))
                .thenReturn(denied());

        assertThat(service.allowInvitation(42L)).isFalse();
        verify(store).tryConsume(startsWith("invite:day:"), anyLong(), any(Duration.class));
        verify(store).tryConsume(startsWith("invite:hour:"), anyLong(), any(Duration.class));
    }

    @Test
    void perTeamKeysAreDistinct() {
        when(store.tryConsume(any(String.class), anyLong(), any(Duration.class)))
                .thenReturn(allowed());

        service.allowInvitation(1L);
        service.allowInvitation(2L);

        verify(store).tryConsume(eq("invite:day:team:1"), anyLong(), any(Duration.class));
        verify(store).tryConsume(eq("invite:day:team:2"), anyLong(), any(Duration.class));
    }

    @Test
    void getInvitationLimitPerHour_returnsConfiguredCap_notRemaining() {
        // Returns the cap, not a live count - no peek call required.
        assertThat(service.getInvitationLimitPerHour()).isEqualTo(50);
        verify(store, never()).tryConsume(any(String.class), anyLong(), any(Duration.class));
    }
}
