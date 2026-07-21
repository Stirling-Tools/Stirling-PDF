package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.proprietary.model.Team;
import stirling.software.saas.model.SaasTeamExtensions;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;

/**
 * Unit tests for {@link SaasTeamExtensionService}.
 *
 * <p>The service is a thin read/write facade over {@link SaasTeamExtensionsRepository}. Reads
 * return safe defaults when no row exists (non-personal, STANDARD type, seatsUsed=0, maxSeats=1,
 * createdBy=null, hasAvailableSeats=true, canInviteMembers=true); writes create the row lazily via
 * {@code getOrCreate}. Pure delegation + Optional mapping, so everything is mocked at the
 * repository boundary.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SaasTeamExtensionServiceTest {

    private static final Long TEAM_ID = 7L;

    @Mock private SaasTeamExtensionsRepository repository;

    @InjectMocks private SaasTeamExtensionService service;

    /** A team with a non-null id (the common case). */
    private static Team team(Long id) {
        Team t = new Team();
        t.setId(id);
        t.setName("team-" + id);
        return t;
    }

    private static Team team() {
        return team(TEAM_ID);
    }

    /** A fresh extension row for the given team carrying entity defaults. */
    private static SaasTeamExtensions ext(Team team) {
        return new SaasTeamExtensions(team);
    }

    @Nested
    @DisplayName("getOrCreate")
    class GetOrCreate {

        @Test
        @DisplayName("returns the existing row without creating a new one")
        void existingRow_returnedWithoutSave() {
            Team team = team();
            SaasTeamExtensions existing = ext(team);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(existing));

            SaasTeamExtensions result = service.getOrCreate(team);

            assertThat(result).isSameAs(existing);
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("lazily creates and saves a new row when none exists")
        void missingRow_savesNew() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            // save echoes back its argument so the returned instance is the freshly built row.
            when(repository.save(any(SaasTeamExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            SaasTeamExtensions result = service.getOrCreate(team);

            ArgumentCaptor<SaasTeamExtensions> captor =
                    ArgumentCaptor.forClass(SaasTeamExtensions.class);
            verify(repository).save(captor.capture());
            SaasTeamExtensions saved = captor.getValue();
            // The new row is bound to the team and carries entity defaults.
            assertThat(saved.getTeam()).isSameAs(team);
            assertThat(saved.getTeamId()).isEqualTo(TEAM_ID);
            assertThat(saved.getTeamType()).isEqualTo(SaasTeamExtensions.TEAM_TYPE_STANDARD);
            assertThat(saved.isPersonal()).isFalse();
            assertThat(saved.getSeatsUsed()).isZero();
            assertThat(saved.getMaxSeats()).isEqualTo(1);
            assertThat(result).isSameAs(saved);
        }
    }

    @Nested
    @DisplayName("isPersonal")
    class IsPersonal {

        @Test
        @DisplayName("null team short-circuits to false without touching the repository")
        void nullTeam_false() {
            assertThat(service.isPersonal(null)).isFalse();
            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("team with null id short-circuits to false without touching the repository")
        void nullId_false() {
            assertThat(service.isPersonal(team(null))).isFalse();
            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("no row defaults to false")
        void noRow_defaultsFalse() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());

            assertThat(service.isPersonal(team)).isFalse();
        }

        @Test
        @DisplayName("reflects the persisted personal flag when a row exists")
        void existingPersonalRow_true() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setIsPersonal(true);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.isPersonal(team)).isTrue();
        }
    }

    @Nested
    @DisplayName("getTeamType")
    class GetTeamType {

        @Test
        @DisplayName("null team defaults to STANDARD without a lookup")
        void nullTeam_standard() {
            assertThat(service.getTeamType(null)).isEqualTo(SaasTeamExtensions.TEAM_TYPE_STANDARD);
            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("team with null id defaults to STANDARD without a lookup")
        void nullId_standard() {
            assertThat(service.getTeamType(team(null)))
                    .isEqualTo(SaasTeamExtensions.TEAM_TYPE_STANDARD);
            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("no row defaults to STANDARD")
        void noRow_standard() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());

            assertThat(service.getTeamType(team)).isEqualTo(SaasTeamExtensions.TEAM_TYPE_STANDARD);
        }

        @Test
        @DisplayName("returns the persisted PERSONAL type when a row exists")
        void existingRow_personalType() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setTeamType(SaasTeamExtensions.TEAM_TYPE_PERSONAL);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.getTeamType(team)).isEqualTo(SaasTeamExtensions.TEAM_TYPE_PERSONAL);
        }
    }

    @Nested
    @DisplayName("getSeatsUsed")
    class GetSeatsUsed {

        @Test
        @DisplayName("no row defaults to 0")
        void noRow_zero() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());

            assertThat(service.getSeatsUsed(team)).isZero();
        }

        @Test
        @DisplayName("returns the persisted seatsUsed value")
        void existingRow_value() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setSeatsUsed(5);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.getSeatsUsed(team)).isEqualTo(5);
        }
    }

    @Nested
    @DisplayName("getMaxSeats")
    class GetMaxSeats {

        @Test
        @DisplayName("no row defaults to 1 (not 0)")
        void noRow_one() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());

            assertThat(service.getMaxSeats(team)).isEqualTo(1);
        }

        @Test
        @DisplayName("returns the persisted maxSeats value")
        void existingRow_value() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setMaxSeats(25);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.getMaxSeats(team)).isEqualTo(25);
        }
    }

    @Nested
    @DisplayName("getCreatedByUserId")
    class GetCreatedByUserId {

        @Test
        @DisplayName("no row defaults to null")
        void noRow_null() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());

            assertThat(service.getCreatedByUserId(team)).isNull();
        }

        @Test
        @DisplayName("row present but creator unset is null")
        void existingRow_unsetCreator_null() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(ext(team)));

            assertThat(service.getCreatedByUserId(team)).isNull();
        }

        @Test
        @DisplayName("returns the persisted creator id")
        void existingRow_value() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setCreatedByUserId(99L);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.getCreatedByUserId(team)).isEqualTo(99L);
        }
    }

    @Nested
    @DisplayName("hasAvailableSeats")
    class HasAvailableSeats {

        @Test
        @DisplayName("no row defaults to true (optimistic)")
        void noRow_true() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());

            assertThat(service.hasAvailableSeats(team)).isTrue();
        }

        @Test
        @DisplayName("standard team always has seats regardless of usage")
        void standardTeam_alwaysTrue() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setIsPersonal(false);
            row.setSeatsUsed(1000);
            row.setMaxSeats(1);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.hasAvailableSeats(team)).isTrue();
        }

        @Test
        @DisplayName("personal team with a free seat returns true")
        void personalTeam_underCap_true() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setIsPersonal(true);
            row.setSeatsUsed(0);
            row.setMaxSeats(1);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.hasAvailableSeats(team)).isTrue();
        }

        @Test
        @DisplayName("personal team at its seat cap returns false (boundary)")
        void personalTeam_atCap_false() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setIsPersonal(true);
            row.setSeatsUsed(1);
            row.setMaxSeats(1);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.hasAvailableSeats(team)).isFalse();
        }
    }

    @Nested
    @DisplayName("canInviteMembers")
    class CanInviteMembers {

        @Test
        @DisplayName("no row defaults to true")
        void noRow_true() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());

            assertThat(service.canInviteMembers(team)).isTrue();
        }

        @Test
        @DisplayName("standard team can invite")
        void standardTeam_true() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setIsPersonal(false);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.canInviteMembers(team)).isTrue();
        }

        @Test
        @DisplayName("personal team can never invite")
        void personalTeam_false() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setIsPersonal(true);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            assertThat(service.canInviteMembers(team)).isFalse();
        }
    }

    @Nested
    @DisplayName("incrementSeatsUsed")
    class IncrementSeatsUsed {

        @Test
        @DisplayName(
                "ensures the row exists then delegates the atomic increment, returning its result")
        void existingRow_delegatesIncrement() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(ext(team)));
            when(repository.incrementSeatsUsed(TEAM_ID)).thenReturn(1);

            int result = service.incrementSeatsUsed(team);

            assertThat(result).isEqualTo(1);
            verify(repository).incrementSeatsUsed(TEAM_ID);
            // Row already existed -> no lazy creation.
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("creates the row first when missing, then increments")
        void missingRow_createsThenIncrements() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(repository.save(any(SaasTeamExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));
            when(repository.incrementSeatsUsed(TEAM_ID)).thenReturn(1);

            int result = service.incrementSeatsUsed(team);

            assertThat(result).isEqualTo(1);
            verify(repository).save(any(SaasTeamExtensions.class));
            verify(repository).incrementSeatsUsed(TEAM_ID);
        }

        @Test
        @DisplayName("returns 0 when the atomic update hits the personal-team cap")
        void capHit_returnsZero() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(ext(team)));
            when(repository.incrementSeatsUsed(TEAM_ID)).thenReturn(0);

            assertThat(service.incrementSeatsUsed(team)).isZero();
        }
    }

    @Nested
    @DisplayName("decrementSeatsUsed")
    class DecrementSeatsUsed {

        @Test
        @DisplayName("delegates straight to the atomic decrement without creating a row")
        void delegatesDecrement() {
            Team team = team();
            when(repository.decrementSeatsUsed(TEAM_ID)).thenReturn(1);

            int result = service.decrementSeatsUsed(team);

            assertThat(result).isEqualTo(1);
            verify(repository).decrementSeatsUsed(TEAM_ID);
            verify(repository, never()).findByTeamId(any());
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("returns 0 when already floored at zero")
        void alreadyZero_returnsZero() {
            Team team = team();
            when(repository.decrementSeatsUsed(TEAM_ID)).thenReturn(0);

            assertThat(service.decrementSeatsUsed(team)).isZero();
        }
    }

    @Nested
    @DisplayName("setPersonal")
    class SetPersonal {

        @Test
        @DisplayName("marking personal sets the flag and the PERSONAL team type, then saves")
        void markPersonal_setsFlagAndType() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            service.setPersonal(team, true);

            assertThat(row.isPersonal()).isTrue();
            assertThat(row.getTeamType()).isEqualTo(SaasTeamExtensions.TEAM_TYPE_PERSONAL);
            verify(repository).save(row);
        }

        @Test
        @DisplayName(
                "marking non-personal clears the flag and reverts to STANDARD type, then saves")
        void markNonPersonal_revertsToStandard() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setIsPersonal(true);
            row.setTeamType(SaasTeamExtensions.TEAM_TYPE_PERSONAL);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            service.setPersonal(team, false);

            assertThat(row.isPersonal()).isFalse();
            assertThat(row.getTeamType()).isEqualTo(SaasTeamExtensions.TEAM_TYPE_STANDARD);
            verify(repository).save(row);
        }

        @Test
        @DisplayName("creates the row first when missing, then applies the personal flag")
        void missingRow_createsThenSets() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(repository.save(any(SaasTeamExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            service.setPersonal(team, true);

            // getOrCreate saves the new row, then setPersonal saves the mutated row.
            ArgumentCaptor<SaasTeamExtensions> captor =
                    ArgumentCaptor.forClass(SaasTeamExtensions.class);
            verify(repository, org.mockito.Mockito.times(2)).save(captor.capture());
            SaasTeamExtensions last = captor.getValue();
            assertThat(last.isPersonal()).isTrue();
            assertThat(last.getTeamType()).isEqualTo(SaasTeamExtensions.TEAM_TYPE_PERSONAL);
        }
    }

    @Nested
    @DisplayName("setSeats")
    class SetSeats {

        @Test
        @DisplayName("writes both seatCount and maxSeats onto the existing row, then saves")
        void existingRow_writesBoth() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            service.setSeats(team, 3, 10);

            assertThat(row.getSeatCount()).isEqualTo(3);
            assertThat(row.getMaxSeats()).isEqualTo(10);
            verify(repository).save(row);
        }

        @Test
        @DisplayName("does not touch seatsUsed (only seatCount and maxSeats)")
        void doesNotChangeSeatsUsed() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setSeatsUsed(4);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            service.setSeats(team, 8, 8);

            assertThat(row.getSeatsUsed()).isEqualTo(4);
        }

        @Test
        @DisplayName("creates the row first when missing, then writes the seat fields")
        void missingRow_createsThenWrites() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(repository.save(any(SaasTeamExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            service.setSeats(team, 2, 5);

            ArgumentCaptor<SaasTeamExtensions> captor =
                    ArgumentCaptor.forClass(SaasTeamExtensions.class);
            verify(repository, org.mockito.Mockito.times(2)).save(captor.capture());
            SaasTeamExtensions last = captor.getValue();
            assertThat(last.getSeatCount()).isEqualTo(2);
            assertThat(last.getMaxSeats()).isEqualTo(5);
        }
    }

    @Nested
    @DisplayName("setCreatedByUserId")
    class SetCreatedByUserId {

        @Test
        @DisplayName("writes the creator id onto the existing row, then saves")
        void existingRow_writesCreator() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            service.setCreatedByUserId(team, 42L);

            assertThat(row.getCreatedByUserId()).isEqualTo(42L);
            verify(repository).save(row);
        }

        @Test
        @DisplayName("accepts a null creator id (clearing)")
        void nullCreator_cleared() {
            Team team = team();
            SaasTeamExtensions row = ext(team);
            row.setCreatedByUserId(5L);
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.of(row));

            service.setCreatedByUserId(team, null);

            assertThat(row.getCreatedByUserId()).isNull();
            verify(repository).save(row);
        }

        @Test
        @DisplayName("creates the row first when missing, then writes the creator id")
        void missingRow_createsThenWrites() {
            Team team = team();
            when(repository.findByTeamId(TEAM_ID)).thenReturn(Optional.empty());
            when(repository.save(any(SaasTeamExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            service.setCreatedByUserId(team, 13L);

            ArgumentCaptor<SaasTeamExtensions> captor =
                    ArgumentCaptor.forClass(SaasTeamExtensions.class);
            verify(repository, org.mockito.Mockito.times(2)).save(captor.capture());
            assertThat(captor.getValue().getCreatedByUserId()).isEqualTo(13L);
        }
    }
}
