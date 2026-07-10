package stirling.software.proprietary.policy.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** {@link PolicyManagementAuthority#requireCurrentUserTeamId()} default behaviour. */
class PolicyManagementAuthorityTest {

    /** Minimal authority returning a fixed team id, exercising only the default method. */
    private static PolicyManagementAuthority withTeam(Long teamId) {
        return new PolicyManagementAuthority() {
            @Override
            public boolean canEditPolicies() {
                return true;
            }

            @Override
            public Long currentUserTeamId() {
                return teamId;
            }
        };
    }

    @Test
    void returnsTheResolvedTeam() {
        assertThat(withTeam(7L).requireCurrentUserTeamId()).isEqualTo(7L);
    }

    @Test
    void rejectsAnUnresolvedTeamInsteadOfSharingTheUnteamedBucket() {
        assertThatThrownBy(() -> withTeam(null).requireCurrentUserTeamId())
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
