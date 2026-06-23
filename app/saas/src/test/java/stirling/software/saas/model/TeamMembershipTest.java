package stirling.software.saas.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

/** Constructor, accessor, equals/hashCode/toString, and role-helper tests for TeamMembership. */
class TeamMembershipTest {

    private static TeamMembership membership() {
        TeamMembership m = new TeamMembership();
        m.setMembershipId(1L);
        m.setRole(TeamRole.MEMBER);
        m.setInvitedAt(LocalDateTime.now());
        return m;
    }

    @Test
    @DisplayName("default role is MEMBER before any setter")
    void defaultRole() {
        assertThat(new TeamMembership().getRole()).isEqualTo(TeamRole.MEMBER);
    }

    @Test
    @DisplayName("every setter round-trips through its getter")
    void settersRoundTrip() {
        Team team = new Team();
        team.setId(7L);
        User user = new User();
        User invitedBy = new User();
        LocalDateTime invited = LocalDateTime.of(2026, 6, 1, 0, 0);
        LocalDateTime accepted = LocalDateTime.of(2026, 6, 2, 0, 0);
        LocalDateTime created = LocalDateTime.of(2026, 6, 1, 0, 0);
        LocalDateTime updated = LocalDateTime.of(2026, 6, 3, 0, 0);

        TeamMembership m = new TeamMembership();
        m.setMembershipId(99L);
        m.setTeam(team);
        m.setUser(user);
        m.setRole(TeamRole.LEADER);
        m.setInvitedBy(invitedBy);
        m.setInvitedAt(invited);
        m.setAcceptedAt(accepted);
        m.setCreatedAt(created);
        m.setUpdatedAt(updated);
        m.setCapUnits(500L);

        assertThat(m.getMembershipId()).isEqualTo(99L);
        assertThat(m.getTeam()).isSameAs(team);
        assertThat(m.getUser()).isSameAs(user);
        assertThat(m.getRole()).isEqualTo(TeamRole.LEADER);
        assertThat(m.getInvitedBy()).isSameAs(invitedBy);
        assertThat(m.getInvitedAt()).isEqualTo(invited);
        assertThat(m.getAcceptedAt()).isEqualTo(accepted);
        assertThat(m.getCreatedAt()).isEqualTo(created);
        assertThat(m.getUpdatedAt()).isEqualTo(updated);
        assertThat(m.getCapUnits()).isEqualTo(500L);
    }

    @Test
    @DisplayName("capUnits defaults to null (bounded only by the team-wide cap)")
    void capUnitsDefaultsNull() {
        assertThat(new TeamMembership().getCapUnits()).isNull();
    }

    @Nested
    @DisplayName("role helpers")
    class RoleHelpers {

        @Test
        @DisplayName("isLeader / isMember reflect the role enum")
        void leaderAndMember() {
            TeamMembership leader = membership();
            leader.setRole(TeamRole.LEADER);
            assertThat(leader.isLeader()).isTrue();
            assertThat(leader.isMember()).isFalse();

            TeamMembership member = membership();
            member.setRole(TeamRole.MEMBER);
            assertThat(member.isMember()).isTrue();
            assertThat(member.isLeader()).isFalse();
        }
    }

    @Nested
    @DisplayName("equals / hashCode / toString")
    class Equality {

        @Test
        @DisplayName("equal membership ids produce equal memberships")
        void equalObjects() {
            TeamMembership a = membership();
            TeamMembership b = membership();
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a).isEqualTo(a);
        }

        @Test
        @DisplayName("a different membership id breaks equality")
        void differentIdNotEqual() {
            TeamMembership a = membership();
            TeamMembership b = membership();
            b.setMembershipId(2L);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or a foreign type")
        void notEqualToNullOrOtherType() {
            TeamMembership a = membership();
            assertThat(a).isNotEqualTo(null).isNotEqualTo("a string");
        }

        @Test
        @DisplayName("toString includes the explicitly-included fields")
        void toStringContainsFields() {
            String s = membership().toString();
            assertThat(s).contains("1").contains("MEMBER");
        }
    }
}
