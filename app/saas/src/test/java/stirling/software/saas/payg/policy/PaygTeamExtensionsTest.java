package stirling.software.saas.payg.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.model.Team;

/** Constructor, default, and accessor coverage for the PaygTeamExtensions sidecar entity. */
class PaygTeamExtensionsTest {

    @Test
    @DisplayName("no-arg constructor defaults the free-units counter to zero")
    void defaults() {
        PaygTeamExtensions ext = new PaygTeamExtensions();
        assertThat(ext.getFreeUnitsRemaining()).isZero();
        assertThat(ext.getPricingPolicyId()).isNull();
        assertThat(ext.getStripeCustomerId()).isNull();
        assertThat(ext.getPaygSubscriptionId()).isNull();
    }

    @Test
    @DisplayName("Team constructor derives the team id from the team reference")
    void teamConstructor() {
        Team team = new Team();
        team.setId(42L);
        PaygTeamExtensions ext = new PaygTeamExtensions(team);
        assertThat(ext.getTeam()).isSameAs(team);
        assertThat(ext.getTeamId()).isEqualTo(42L);
    }

    @Test
    @DisplayName("every setter round-trips through its getter")
    void settersRoundTrip() {
        LocalDateTime created = LocalDateTime.of(2026, 6, 1, 0, 0);
        LocalDateTime updated = LocalDateTime.of(2026, 6, 2, 0, 0);

        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(5L);
        ext.setPricingPolicyId(11L);
        ext.setStripeCustomerId("cus_abc");
        ext.setPaygSubscriptionId("sub_xyz");
        ext.setFreeUnitsRemaining(250L);
        ext.setCreatedAt(created);
        ext.setUpdatedAt(updated);
        ext.setVersion(3L);

        assertThat(ext.getTeamId()).isEqualTo(5L);
        assertThat(ext.getPricingPolicyId()).isEqualTo(11L);
        assertThat(ext.getStripeCustomerId()).isEqualTo("cus_abc");
        assertThat(ext.getPaygSubscriptionId()).isEqualTo("sub_xyz");
        assertThat(ext.getFreeUnitsRemaining()).isEqualTo(250L);
        assertThat(ext.getCreatedAt()).isEqualTo(created);
        assertThat(ext.getUpdatedAt()).isEqualTo(updated);
        assertThat(ext.getVersion()).isEqualTo(3L);
    }
}
