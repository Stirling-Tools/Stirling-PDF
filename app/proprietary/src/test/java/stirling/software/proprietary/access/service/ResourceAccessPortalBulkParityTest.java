package stirling.software.proprietary.access.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.access.model.AccessPermission;
import stirling.software.proprietary.access.model.DefaultAccessPolicy;
import stirling.software.proprietary.access.model.PrincipalRef;
import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.model.ResourceGrant;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;

/** Bulk portal-access must match per-user canAccessPortal for every policy. */
@ExtendWith(MockitoExtension.class)
class ResourceAccessPortalBulkParityTest {

    @Mock private ResourceGrantRepository grantRepository;
    @Mock private TeamLeadLookup teamLeadLookup;

    private ResourceAccessService service;

    private User admin;
    private User leader;
    private User userGrantHolder;
    private User teamGrantMember;
    private User plainMember;
    private List<User> everyone;
    private Set<Long> leaderUserIds;

    void setUp(DefaultAccessPolicy policy) {
        service =
                new ResourceAccessService(
                        grantRepository, teamLeadLookup, new DefaultPrincipalResolver());
        ReflectionTestUtils.setField(service, "portalDefaultPolicy", policy);

        admin = user(1L, null, Role.ADMIN.getRoleId());
        leader = user(2L, 10L, Role.USER.getRoleId());
        userGrantHolder = user(3L, null, Role.USER.getRoleId());
        teamGrantMember = user(4L, 20L, Role.USER.getRoleId());
        plainMember = user(5L, 10L, Role.USER.getRoleId());
        everyone = List.of(admin, leader, userGrantHolder, teamGrantMember, plainMember);

        // Grants: a USER grant to #3 and a TEAM grant to team 20 (which #4 belongs to).
        lenient()
                .when(grantRepository.findByResourceTypeAndResourceId(ResourceType.PORTAL, ""))
                .thenReturn(
                        List.of(
                                grant(PrincipalType.USER, 3L, AccessPermission.USE),
                                grant(PrincipalType.TEAM, 20L, AccessPermission.USE)));

        // Only #2 leads their active team; leaderUserIds is what the controller passes to the
        // bulk method (the active-team-leader set).
        lenient().when(teamLeadLookup.isLeaderOfTeam(leader, 10L)).thenReturn(true);
        leaderUserIds = Set.of(2L);
    }

    @Test
    void bulkMatchesPerUserForAdminsAndTeamLeadsPolicy() {
        assertParity(DefaultAccessPolicy.ADMINS_AND_TEAM_LEADS);
    }

    @Test
    void bulkMatchesPerUserForOrgAllPolicy() {
        assertParity(DefaultAccessPolicy.ORG_ALL);
    }

    @Test
    void bulkMatchesPerUserForExplicitOnlyPolicy() {
        assertParity(DefaultAccessPolicy.EXPLICIT_ONLY);
    }

    /** SaaS no-leak: ORG_ALL grants nobody deployment-wide when the resolver forbids it. */
    @Test
    void orgAllDoesNotLeakDeploymentWideWhenResolverForbidsIt() {
        DefaultPrincipalResolver base = new DefaultPrincipalResolver();
        PrincipalResolver saasLikeResolver =
                new PrincipalResolver() {
                    @Override
                    public Set<PrincipalRef> principalsOf(User user) {
                        return base.principalsOf(user);
                    }
                    // allowsDeploymentWideAccess() inherits the interface default (false) = SaaS.
                };
        service = new ResourceAccessService(grantRepository, teamLeadLookup, saasLikeResolver);
        ReflectionTestUtils.setField(service, "portalDefaultPolicy", DefaultAccessPolicy.ORG_ALL);
        lenient()
                .when(grantRepository.findByResourceTypeAndResourceId(ResourceType.PORTAL, ""))
                .thenReturn(List.of());

        User adminUser = user(1L, null, Role.ADMIN.getRoleId());
        User plainMember = user(5L, 10L, Role.USER.getRoleId());

        Set<Long> bulk = service.usersWithPortalAccess(List.of(adminUser, plainMember), Set.of());

        assertThat(bulk).contains(1L).doesNotContain(5L);
        assertThat(service.canAccessPortal(plainMember))
                .as("ORG_ALL must not grant a plain member deployment-wide on a SaaS-like resolver")
                .isFalse();
        assertThat(service.canAccessPortal(adminUser)).isTrue();
    }

    private void assertParity(DefaultAccessPolicy policy) {
        setUp(policy);
        Set<Long> bulk = service.usersWithPortalAccess(everyone, leaderUserIds);
        for (User user : everyone) {
            boolean authoritative = service.canAccessPortal(user);
            assertThat(bulk.contains(user.getId()))
                    .as(
                            "policy=%s user=%d bulk should equal canAccessPortal(%s)",
                            policy, user.getId(), authoritative)
                    .isEqualTo(authoritative);
        }
    }

    private User user(Long id, Long teamId, String authority) {
        User user = new User();
        user.setId(id);
        user.setUsername("user-" + id);
        new Authority(authority, user);
        if (teamId != null) {
            Team team = new Team();
            team.setId(teamId);
            team.setName("team-" + teamId);
            user.setTeam(team);
        }
        return user;
    }

    private ResourceGrant grant(PrincipalType type, Long principalId, AccessPermission permission) {
        ResourceGrant grant = new ResourceGrant();
        grant.setResourceType(ResourceType.PORTAL);
        grant.setResourceId("");
        grant.setPrincipalType(type);
        grant.setPrincipalId(principalId);
        grant.setPermission(permission);
        return grant;
    }
}
