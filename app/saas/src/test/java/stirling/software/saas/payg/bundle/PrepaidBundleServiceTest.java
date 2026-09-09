package stirling.software.saas.payg.bundle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.saas.payg.bundle.PrepaidBundleService.PrepaidSummary;

/**
 * Unit tests for the prepaid-bundle draw/restore/summarize money logic. The repository is mocked,
 * so these pin the in-Java arithmetic (FIFO depletion, per-pool caps, best-effort restore,
 * aggregation) — the FIFO-by-expiry ordering and the expiry/lock filters live in the repository
 * JPQL and are covered separately by the query definitions, not here.
 */
class PrepaidBundleServiceTest {

    private static final Long TEAM = 42L;
    private static final LocalDateTime SOON = LocalDateTime.of(2026, 8, 1, 0, 0);
    private static final LocalDateTime LATER = LocalDateTime.of(2026, 12, 1, 0, 0);

    private PrepaidBundleRepository repo;
    private PrepaidBundleService service;

    @BeforeEach
    void setUp() {
        repo = Mockito.mock(PrepaidBundleRepository.class);
        service = new PrepaidBundleService(repo);
    }

    private static PrepaidBundle pool(long total, long remaining, LocalDateTime expiresAt) {
        PrepaidBundle b = new PrepaidBundle();
        b.setTeamId(TEAM);
        b.setUnitsTotal(total);
        b.setUnitsRemaining(remaining);
        b.setExpiresAt(expiresAt);
        return b;
    }

    // ── draw ────────────────────────────────────────────────────────────────

    @Test
    void draw_nullTeamOrNonPositiveUnits_returnsZeroWithoutTouchingRepo() {
        assertThat(service.draw(null, 100)).isZero();
        assertThat(service.draw(TEAM, 0)).isZero();
        assertThat(service.draw(TEAM, -5)).isZero();
        verifyNoInteractions(repo);
    }

    @Test
    void draw_partialFromSinglePool_leavesRemainder() {
        PrepaidBundle p = pool(1000, 1000, SOON);
        when(repo.findDrawableForUpdate(eq(TEAM), any())).thenReturn(List.of(p));

        int drawn = service.draw(TEAM, 300);

        assertThat(drawn).isEqualTo(300);
        assertThat(p.getUnitsRemaining()).isEqualTo(700);
        verify(repo).saveAll(List.of(p));
    }

    @Test
    void draw_spansPoolsFifo_cappedAtEachPoolBalance() {
        // Repo returns soonest-expiring first; the earlier pool is depleted before the later one.
        PrepaidBundle first = pool(1000, 100, SOON);
        PrepaidBundle second = pool(1000, 1000, LATER);
        when(repo.findDrawableForUpdate(eq(TEAM), any())).thenReturn(List.of(first, second));

        int drawn = service.draw(TEAM, 250);

        assertThat(drawn).isEqualTo(250);
        assertThat(first.getUnitsRemaining()).isZero(); // fully depleted first
        assertThat(second.getUnitsRemaining()).isEqualTo(850); // 150 taken from the later pool
    }

    @Test
    void draw_moreThanAvailable_drawsOnlyWhatExists() {
        PrepaidBundle p = pool(1000, 120, SOON);
        when(repo.findDrawableForUpdate(eq(TEAM), any())).thenReturn(List.of(p));

        int drawn = service.draw(TEAM, 500);

        assertThat(drawn).isEqualTo(120); // partial draw; the remainder meters
        assertThat(p.getUnitsRemaining()).isZero();
    }

    @Test
    void draw_noDrawablePools_returnsZeroAndDoesNotSave() {
        when(repo.findDrawableForUpdate(eq(TEAM), any())).thenReturn(List.of());

        assertThat(service.draw(TEAM, 100)).isZero();
        verify(repo, never()).saveAll(any());
    }

    // ── restore ─────────────────────────────────────────────────────────────

    @Test
    void restore_capsEachPoolAtItsOriginalTotal() {
        // Two in-term pools with headroom 60 then 200; restoring 100 fills the first, spills 40 to
        // the
        // second, and never exceeds units_total on either.
        PrepaidBundle first = pool(1000, 940, SOON); // headroom 60
        PrepaidBundle second = pool(1000, 800, LATER); // headroom 200
        when(repo.findInTermForUpdate(eq(TEAM), any())).thenReturn(List.of(first, second));

        int restored = service.restore(TEAM, 100);

        assertThat(restored).isEqualTo(100);
        assertThat(first.getUnitsRemaining()).isEqualTo(1000); // capped at total
        assertThat(second.getUnitsRemaining()).isEqualTo(840);
        verify(repo).saveAll(List.of(first, second));
    }

    @Test
    void restore_dropsUnitsThatCannotBePlaced() {
        // Only 60 headroom for a 100 restore → 60 restored, 40 dropped (best-effort).
        PrepaidBundle p = pool(1000, 940, SOON);
        when(repo.findInTermForUpdate(eq(TEAM), any())).thenReturn(List.of(p));

        int restored = service.restore(TEAM, 100);

        assertThat(restored).isEqualTo(60);
        assertThat(p.getUnitsRemaining()).isEqualTo(1000);
    }

    @Test
    void restore_nullTeamOrNonPositive_returnsZeroWithoutRepo() {
        assertThat(service.restore(null, 10)).isZero();
        assertThat(service.restore(TEAM, 0)).isZero();
        verifyNoInteractions(repo);
    }

    // ── summarize / prepaidRemainingUnits ─────────────────────────────────────

    @Test
    void summarize_nullWhenNoInTermPools() {
        when(repo.findInTerm(eq(TEAM), any())).thenReturn(List.of());
        assertThat(service.summarize(TEAM)).isNull();
    }

    @Test
    void summarize_sumsBalancesAndPicksSoonestExpiry() {
        when(repo.findInTerm(eq(TEAM), any()))
                .thenReturn(List.of(pool(1000, 250, LATER), pool(500, 500, SOON)));

        PrepaidSummary summary = service.summarize(TEAM);

        assertThat(summary.unitsRemaining()).isEqualTo(750);
        assertThat(summary.unitsTotal()).isEqualTo(1500);
        assertThat(summary.expiresAt()).isEqualTo(SOON); // earliest across pools
    }

    @Test
    void prepaidRemainingUnits_delegatesToSummary_zeroWhenNone() {
        when(repo.findInTerm(eq(TEAM), any())).thenReturn(List.of());
        assertThat(service.prepaidRemainingUnits(TEAM)).isZero();

        when(repo.findInTerm(eq(TEAM), any()))
                .thenReturn(List.of(pool(1000, 400, SOON), pool(1000, 350, LATER)));
        assertThat(service.prepaidRemainingUnits(TEAM)).isEqualTo(750);
    }
}
