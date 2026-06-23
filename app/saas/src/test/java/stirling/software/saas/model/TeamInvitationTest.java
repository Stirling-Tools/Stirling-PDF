package stirling.software.saas.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

/** Constructor, accessor, equals/hashCode/toString, and status-helper tests for TeamInvitation. */
class TeamInvitationTest {

    private static TeamInvitation invitation() {
        TeamInvitation inv = new TeamInvitation();
        inv.setInvitationId(1L);
        inv.setInviteeEmail("invitee@example.com");
        inv.setInvitationToken("tok-123");
        inv.setStatus(InvitationStatus.PENDING);
        inv.setExpiresAt(LocalDateTime.now().plusDays(7));
        return inv;
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("default status is PENDING before any setter")
        void defaultStatus() {
            assertThat(new TeamInvitation().getStatus()).isEqualTo(InvitationStatus.PENDING);
        }

        @Test
        @DisplayName("every setter round-trips through its getter")
        void settersRoundTrip() {
            Team team = new Team();
            team.setId(7L);
            User inviter = new User();
            User invitee = new User();
            LocalDateTime expires = LocalDateTime.of(2026, 7, 1, 0, 0);
            LocalDateTime created = LocalDateTime.of(2026, 6, 1, 0, 0);
            LocalDateTime updated = LocalDateTime.of(2026, 6, 2, 0, 0);

            TeamInvitation inv = new TeamInvitation();
            inv.setInvitationId(42L);
            inv.setTeam(team);
            inv.setInviter(inviter);
            inv.setInviteeEmail("a@b.com");
            inv.setInviteeUser(invitee);
            inv.setStatus(InvitationStatus.ACCEPTED);
            inv.setInvitationToken("token-xyz");
            inv.setExpiresAt(expires);
            inv.setCreatedAt(created);
            inv.setUpdatedAt(updated);

            assertThat(inv.getInvitationId()).isEqualTo(42L);
            assertThat(inv.getTeam()).isSameAs(team);
            assertThat(inv.getInviter()).isSameAs(inviter);
            assertThat(inv.getInviteeEmail()).isEqualTo("a@b.com");
            assertThat(inv.getInviteeUser()).isSameAs(invitee);
            assertThat(inv.getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
            assertThat(inv.getInvitationToken()).isEqualTo("token-xyz");
            assertThat(inv.getExpiresAt()).isEqualTo(expires);
            assertThat(inv.getCreatedAt()).isEqualTo(created);
            assertThat(inv.getUpdatedAt()).isEqualTo(updated);
        }
    }

    @Nested
    @DisplayName("status helpers")
    class StatusHelpers {

        @Test
        @DisplayName(
                "isExpired is false for a null expiry and a future expiry, true for a past one")
        void isExpired() {
            TeamInvitation nullExpiry = new TeamInvitation();
            assertThat(nullExpiry.isExpired()).isFalse();

            TeamInvitation future = invitation();
            assertThat(future.isExpired()).isFalse();

            TeamInvitation past = invitation();
            past.setExpiresAt(LocalDateTime.now().minusDays(1));
            assertThat(past.isExpired()).isTrue();
        }

        @Test
        @DisplayName("isPending requires PENDING status and a non-expired window")
        void isPending() {
            assertThat(invitation().isPending()).isTrue();

            TeamInvitation expired = invitation();
            expired.setExpiresAt(LocalDateTime.now().minusDays(1));
            assertThat(expired.isPending()).isFalse();

            TeamInvitation accepted = invitation();
            accepted.setStatus(InvitationStatus.ACCEPTED);
            assertThat(accepted.isPending()).isFalse();
        }

        @Test
        @DisplayName("isAccepted and isRejected reflect the status enum")
        void isAcceptedAndRejected() {
            TeamInvitation accepted = invitation();
            accepted.setStatus(InvitationStatus.ACCEPTED);
            assertThat(accepted.isAccepted()).isTrue();
            assertThat(accepted.isRejected()).isFalse();

            TeamInvitation rejected = invitation();
            rejected.setStatus(InvitationStatus.REJECTED);
            assertThat(rejected.isRejected()).isTrue();
            assertThat(rejected.isAccepted()).isFalse();
        }
    }

    @Nested
    @DisplayName("equals / hashCode / toString")
    class Equality {

        @Test
        @DisplayName("equal id and token produce equal invitations")
        void equalObjects() {
            TeamInvitation a = invitation();
            TeamInvitation b = invitation();
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a).isEqualTo(a);
        }

        @Test
        @DisplayName("a different token breaks equality")
        void differentTokenNotEqual() {
            TeamInvitation a = invitation();
            TeamInvitation b = invitation();
            b.setInvitationToken("other-token");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or a foreign type")
        void notEqualToNullOrOtherType() {
            TeamInvitation a = invitation();
            assertThat(a).isNotEqualTo(null).isNotEqualTo("a string");
        }

        @Test
        @DisplayName("toString includes the explicitly-included fields")
        void toStringContainsFields() {
            String s = invitation().toString();
            assertThat(s).contains("invitee@example.com").contains("tok-123").contains("PENDING");
        }
    }
}
