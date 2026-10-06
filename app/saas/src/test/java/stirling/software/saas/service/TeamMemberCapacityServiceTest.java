package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import stirling.software.saas.service.TeamMemberCapacityService.MakeActiveResult;

class TeamMemberCapacityServiceTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final TeamMemberCapacityService service = new TeamMemberCapacityService(jdbc);

    @Test
    @SuppressWarnings("unchecked")
    void anUnreadableFlagFailsOpen() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(42L), eq(7L)))
                .thenThrow(new DataAccessResourceFailureException("column missing"));
        assertThat(service.isDisabled(42L, 7L)).isFalse();
        when(jdbc.queryForList(anyString(), eq(Long.class), eq(42L)))
                .thenThrow(new DataAccessResourceFailureException("column missing"));
        assertThat(service.disabledUserIds(42L)).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void aSetFlagReadsAsDisabled() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(42L), eq(7L)))
                .thenReturn(List.of(true));
        assertThat(service.isDisabled(42L, 7L)).isTrue();
    }

    @Test
    void makeActiveMapsEachOutcome() {
        when(jdbc.queryForObject(anyString(), eq(String.class), eq(42L), eq(7L), isNull()))
                .thenReturn("no_place");
        when(jdbc.queryForObject(anyString(), eq(String.class), eq(42L), eq(7L), eq(3L)))
                .thenReturn("activated");
        when(jdbc.queryForObject(anyString(), eq(String.class), eq(42L), eq(8L), eq(3L)))
                .thenReturn("surprise");
        assertThat(service.makeActive(42L, 7L, null)).isEqualTo(MakeActiveResult.NO_PLACE);
        assertThat(service.makeActive(42L, 7L, 3L)).isEqualTo(MakeActiveResult.ACTIVATED);
        assertThat(service.makeActive(42L, 8L, 3L)).isEqualTo(MakeActiveResult.UNAVAILABLE);
    }

    @Test
    void aMissingFunctionAnswersUnavailableRatherThanFailing() {
        when(jdbc.queryForObject(anyString(), eq(String.class), eq(42L), eq(7L), isNull()))
                .thenThrow(new DataAccessResourceFailureException("function does not exist"));
        assertThat(service.makeActive(42L, 7L, null)).isEqualTo(MakeActiveResult.UNAVAILABLE);
    }

    @Test
    void refillWaitsForTheDepartureToCommit() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.refillAfterCommit(42L);
            verify(jdbc, never()).queryForObject(anyString(), eq(Integer.class), eq(42L));
            for (TransactionSynchronization sync :
                    TransactionSynchronizationManager.getSynchronizations()) {
                sync.afterCommit();
            }
            verify(jdbc)
                    .queryForObject(
                            "SELECT stirling_pdf.apply_team_member_capacity(?, false)",
                            Integer.class,
                            42L);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void aFailedRefillNeverFailsTheDeparture() {
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(42L)))
                .thenThrow(new DataAccessResourceFailureException("down"));
        service.refillAfterCommit(42L);
    }
}
