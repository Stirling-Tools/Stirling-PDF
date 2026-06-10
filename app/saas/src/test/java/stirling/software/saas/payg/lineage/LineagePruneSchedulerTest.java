package stirling.software.saas.payg.lineage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class LineagePruneSchedulerTest {

    @Test
    void prune_passesNowMinusRetentionToStore() {
        JobLineageStore store = Mockito.mock(JobLineageStore.class);
        when(store.pruneOlderThan(any(Instant.class))).thenReturn(7);
        Duration retention = Duration.ofHours(1);

        Instant before = Instant.now();
        new LineagePruneScheduler(store, retention).prune();
        Instant after = Instant.now();

        ArgumentCaptor<Instant> captor = ArgumentCaptor.forClass(Instant.class);
        verify(store).pruneOlderThan(captor.capture());
        Instant cutoff = captor.getValue();
        // cutoff should sit inside [before-retention, after-retention] — bounds the wall-clock
        // drift the test itself introduces between the captor and our reference reads.
        assertThat(cutoff).isBetween(before.minus(retention), after.minus(retention));
    }

    @Test
    void constructor_rejectsNonPositiveRetention() {
        JobLineageStore store = Mockito.mock(JobLineageStore.class);
        assertThatThrownBy(() -> new LineagePruneScheduler(store, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new LineagePruneScheduler(store, Duration.ofMinutes(5).negated()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void prune_zeroDeletedDoesNotThrow() {
        JobLineageStore store = Mockito.mock(JobLineageStore.class);
        when(store.pruneOlderThan(any(Instant.class))).thenReturn(0);
        new LineagePruneScheduler(store, Duration.ofHours(1)).prune();
        verify(store).pruneOlderThan(any(Instant.class));
    }
}
