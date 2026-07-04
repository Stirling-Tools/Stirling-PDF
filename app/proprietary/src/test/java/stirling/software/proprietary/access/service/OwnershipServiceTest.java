package stirling.software.proprietary.access.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.access.model.OwnedResource;
import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;

@ExtendWith(MockitoExtension.class)
class OwnershipServiceTest {

    private static final ResourceType TYPE = ResourceType.INTEGRATION_CONFIG;

    @Mock private ResourceAccessService accessService;
    @Mock private TeamLeadLookup teamLeadLookup;
    @Mock private TeamRepository teamRepository;

    @InjectMocks private OwnershipService ownership;

    /** Minimal concrete OwnedResource for exercising the base behaviour. */
    static class TestResource extends OwnedResource {
        private final Long id;

        TestResource(Long id) {
            this.id = id;
        }

        @Override
        public Long getId() {
            return id;
        }
    }

    // ---- scope-based create authorization ----

    @Test
    void userScopeSetsOwner() {
        User user = user(7);
        TestResource r = new TestResource(1L);

        ownership.assignOwnership(r, OwnerScope.USER, null, user, () -> false);

        assertThat(r.getScope()).isEqualTo(OwnerScope.USER);
        assertThat(r.getOwnerUser()).isSameAs(user);
    }

    @Test
    void userScopeBlockedByLockedServerOverride() {
        assertForbidden(
                () ->
                        ownership.assignOwnership(
                                new TestResource(1L), OwnerScope.USER, null, user(7), () -> true));
    }

    @Test
    void adminMayCreateServerScope() {
        TestResource r = new TestResource(1L);
        ownership.assignOwnership(r, OwnerScope.SERVER, null, admin(1), () -> false);
        assertThat(r.getOwnerUser()).isNull();
    }

    @Test
    void nonAdminCannotCreateServerScope() {
        assertForbidden(
                () ->
                        ownership.assignOwnership(
                                new TestResource(1L),
                                OwnerScope.SERVER,
                                null,
                                user(7),
                                () -> false));
    }

    @Test
    void teamLeaderMayCreateTeamScope() {
        Team team = new Team();
        team.setId(5L);
        User user = user(7);
        when(teamRepository.findById(5L)).thenReturn(Optional.of(team));
        when(teamLeadLookup.isLeaderOfTeam(user, 5L)).thenReturn(true);

        TestResource r = new TestResource(1L);
        ownership.assignOwnership(r, OwnerScope.TEAM, 5L, user, () -> false);

        assertThat(r.getOwnerTeam()).isSameAs(team);
    }

    @Test
    void nonLeaderCannotCreateTeamScope() {
        Team team = new Team();
        team.setId(5L);
        when(teamRepository.findById(5L)).thenReturn(Optional.of(team));

        assertForbidden(
                () ->
                        ownership.assignOwnership(
                                new TestResource(1L), OwnerScope.TEAM, 5L, user(7), () -> false));
    }

    // ---- use / manage ----

    @Test
    void enabledResourceUseDelegatesToTheAcl() {
        TestResource r = new TestResource(1L);
        User user = user(7);
        when(accessService.canUseResource(any(), any(), any(), any(), any())).thenReturn(true);

        assertThat(ownership.canUse(TYPE, r, user)).isTrue();
    }

    @Test
    void disabledResourceUsableOnlyByOwnerOrAdmin() {
        TestResource r = new TestResource(1L);
        r.setEnabled(false);
        r.setOwnerUser(user(7));

        assertThat(ownership.canUse(TYPE, r, user(7))).isTrue(); // owner
        assertThat(ownership.canUse(TYPE, r, user(8))).isFalse(); // someone else
        assertThat(ownership.canUse(TYPE, r, admin(2))).isTrue(); // admin
    }

    @Test
    void disabledTeamResourceUsableByLeaderOfOwningTeam() {
        Team team = new Team();
        team.setId(5L);
        TestResource r = new TestResource(1L);
        r.setEnabled(false);
        r.setOwnerTeam(team);
        User leader = user(7);
        when(teamLeadLookup.isLeaderOfTeam(leader, 5L)).thenReturn(true);

        assertThat(ownership.canUse(TYPE, r, leader)).isTrue(); // lead of the owning team
        assertThat(ownership.canUse(TYPE, r, user(8))).isFalse(); // not a lead
    }

    // ---- helpers ----

    private void assertForbidden(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call)
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    private User user(long id) {
        User u = new User();
        u.setId(id);
        u.setUsername("user" + id);
        return u;
    }

    private User admin(long id) {
        User u = user(id);
        new Authority("ROLE_ADMIN", u);
        return u;
    }
}
