package stirling.software.saas.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.model.Team;

/** Constructor, defaults, accessor, and seat/personal-team branch tests for SaasTeamExtensions. */
class SaasTeamExtensionsTest {

    @Test
    @DisplayName("no-arg constructor carries sensible standard-team defaults")
    void defaults() {
        SaasTeamExtensions ext = new SaasTeamExtensions();
        assertThat(ext.getTeamType()).isEqualTo(SaasTeamExtensions.TEAM_TYPE_STANDARD);
        assertThat(ext.getIsPersonal()).isFalse();
        assertThat(ext.getSeatCount()).isEqualTo(1);
        assertThat(ext.getSeatsUsed()).isZero();
        assertThat(ext.getMaxSeats()).isEqualTo(1);
        assertThat(ext.isPersonal()).isFalse();
    }

    @Test
    @DisplayName("Team constructor derives the team id from the team reference")
    void teamConstructor() {
        Team team = new Team();
        team.setId(42L);
        SaasTeamExtensions ext = new SaasTeamExtensions(team);
        assertThat(ext.getTeam()).isSameAs(team);
        assertThat(ext.getTeamId()).isEqualTo(42L);
    }

    @Test
    @DisplayName("every setter round-trips through its getter")
    void settersRoundTrip() {
        LocalDateTime created = LocalDateTime.of(2026, 6, 1, 0, 0);
        LocalDateTime updated = LocalDateTime.of(2026, 6, 2, 0, 0);

        SaasTeamExtensions ext = new SaasTeamExtensions();
        ext.setTeamId(5L);
        ext.setTeamType(SaasTeamExtensions.TEAM_TYPE_PERSONAL);
        ext.setIsPersonal(Boolean.TRUE);
        ext.setSeatCount(3);
        ext.setSeatsUsed(2);
        ext.setMaxSeats(10);
        ext.setCreatedByUserId(99L);
        ext.setCreatedAt(created);
        ext.setUpdatedAt(updated);
        ext.setVersion(4L);

        assertThat(ext.getTeamId()).isEqualTo(5L);
        assertThat(ext.getTeamType()).isEqualTo(SaasTeamExtensions.TEAM_TYPE_PERSONAL);
        assertThat(ext.getIsPersonal()).isTrue();
        assertThat(ext.getSeatCount()).isEqualTo(3);
        assertThat(ext.getSeatsUsed()).isEqualTo(2);
        assertThat(ext.getMaxSeats()).isEqualTo(10);
        assertThat(ext.getCreatedByUserId()).isEqualTo(99L);
        assertThat(ext.getCreatedAt()).isEqualTo(created);
        assertThat(ext.getUpdatedAt()).isEqualTo(updated);
        assertThat(ext.getVersion()).isEqualTo(4L);
    }

    @Nested
    @DisplayName("isPersonal")
    class IsPersonal {

        @Test
        @DisplayName("true only when the flag is Boolean.TRUE")
        void reflectsFlag() {
            SaasTeamExtensions ext = new SaasTeamExtensions();
            assertThat(ext.isPersonal()).isFalse();
            ext.setIsPersonal(Boolean.TRUE);
            assertThat(ext.isPersonal()).isTrue();
            ext.setIsPersonal(null);
            assertThat(ext.isPersonal()).isFalse();
        }
    }

    @Nested
    @DisplayName("hasAvailableSeats")
    class HasAvailableSeats {

        @Test
        @DisplayName("standard teams are always unlimited")
        void standardUnlimited() {
            SaasTeamExtensions ext = new SaasTeamExtensions();
            ext.setSeatsUsed(100);
            ext.setMaxSeats(1);
            assertThat(ext.hasAvailableSeats()).isTrue();
        }

        @Test
        @DisplayName("personal team has seats only while used < max")
        void personalBounded() {
            SaasTeamExtensions ext = new SaasTeamExtensions();
            ext.setIsPersonal(Boolean.TRUE);
            ext.setMaxSeats(1);

            ext.setSeatsUsed(0);
            assertThat(ext.hasAvailableSeats()).isTrue();

            ext.setSeatsUsed(1);
            assertThat(ext.hasAvailableSeats()).isFalse();
        }

        @Test
        @DisplayName("personal team with null seat counters has no available seats")
        void personalNullCountersFalse() {
            SaasTeamExtensions ext = new SaasTeamExtensions();
            ext.setIsPersonal(Boolean.TRUE);
            ext.setSeatsUsed(null);
            ext.setMaxSeats(null);
            assertThat(ext.hasAvailableSeats()).isFalse();
        }
    }

    @Nested
    @DisplayName("canInviteMembers")
    class CanInviteMembers {

        @Test
        @DisplayName("standard teams can invite, personal teams cannot")
        void byPersonalFlag() {
            SaasTeamExtensions standard = new SaasTeamExtensions();
            assertThat(standard.canInviteMembers()).isTrue();

            SaasTeamExtensions personal = new SaasTeamExtensions();
            personal.setIsPersonal(Boolean.TRUE);
            assertThat(personal.canInviteMembers()).isFalse();
        }
    }
}
