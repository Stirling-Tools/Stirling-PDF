package stirling.software.proprietary.access.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.access.model.AccessPermission;
import stirling.software.proprietary.access.model.DefaultAccessPolicy;
import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.model.ResourceGrant;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;

@ExtendWith(MockitoExtension.class)
class ResourceAccessServiceTest {

    private static final ResourceType TYPE = ResourceType.INTEGRATION_CONFIG;
    private static final String RID = "42";

    @Mock private ResourceGrantRepository grantRepository;
    @Mock private TeamLeadLookup teamLeadLookup;

    @InjectMocks private ResourceAccessService service;

    @BeforeEach
    void setPortalDefault() throws Exception {
        Field f = ResourceAccessService.class.getDeclaredField("portalDefaultPolicy");
        f.setAccessible(true);
        f.set(service, DefaultAccessPolicy.ADMINS_AND_TEAM_LEADS);
    }

    // ---- owner / admin short-circuits ----

    @Test
    void adminMayUseEvenWithExplicitOnlyAndNoGrants() {
        assertThat(
                        service.canUseResource(
                                TYPE, RID, null, DefaultAccessPolicy.EXPLICIT_ONLY, admin(1)))
                .isTrue();
    }

    @Test
    void ownerMayUseEvenWithExplicitOnly() {
        assertThat(
                        service.canUseResource(
                                TYPE, RID, 5L, DefaultAccessPolicy.EXPLICIT_ONLY, user(5)))
                .isTrue();
    }

    @Test
    void nullUserIsAlwaysDenied() {
        assertThat(service.canUseResource(TYPE, RID, 5L, DefaultAccessPolicy.ORG_ALL, null))
                .isFalse();
        assertThat(service.canManageResource(TYPE, RID, 5L, null)).isFalse();
    }

    // ---- explicit grants ----

    @Test
    void explicitUserGrantAllowsUse() {
        stubGrants(grant(PrincipalType.USER, 5L, AccessPermission.USE));
        assertThat(
                        service.canUseResource(
                                TYPE, RID, null, DefaultAccessPolicy.EXPLICIT_ONLY, user(5)))
                .isTrue();
    }

    @Test
    void teamGrantAllowsUseForTeamMember() {
        stubGrants(grant(PrincipalType.TEAM, 7L, AccessPermission.USE));
        assertThat(
                        service.canUseResource(
                                TYPE,
                                RID,
                                null,
                                DefaultAccessPolicy.EXPLICIT_ONLY,
                                userInTeam(5, 7)))
                .isTrue();
    }

    @Test
    void teamGrantDoesNotLeakToOtherTeams() {
        stubGrants(grant(PrincipalType.TEAM, 7L, AccessPermission.USE));
        assertThat(
                        service.canUseResource(
                                TYPE,
                                RID,
                                null,
                                DefaultAccessPolicy.EXPLICIT_ONLY,
                                userInTeam(5, 99)))
                .isFalse();
    }

    @Test
    void manageGrantImpliesUse() {
        stubGrants(grant(PrincipalType.USER, 5L, AccessPermission.MANAGE));
        assertThat(
                        service.canUseResource(
                                TYPE, RID, null, DefaultAccessPolicy.EXPLICIT_ONLY, user(5)))
                .isTrue();
    }

    @Test
    void useGrantDoesNotImplyManage() {
        stubGrants(grant(PrincipalType.USER, 5L, AccessPermission.USE));
        assertThat(service.canManageResource(TYPE, RID, null, user(5))).isFalse();
    }

    @Test
    void manageGrantAllowsManage() {
        stubGrants(grant(PrincipalType.USER, 5L, AccessPermission.MANAGE));
        assertThat(service.canManageResource(TYPE, RID, null, user(5))).isTrue();
    }

    // ---- default policies ----

    @Test
    void orgAllDefaultAllowsAnyUser() {
        stubGrants();
        assertThat(service.canUseResource(TYPE, RID, null, DefaultAccessPolicy.ORG_ALL, user(5)))
                .isTrue();
    }

    @Test
    void explicitOnlyDefaultDeniesUngrantedUser() {
        stubGrants();
        assertThat(
                        service.canUseResource(
                                TYPE, RID, null, DefaultAccessPolicy.EXPLICIT_ONLY, user(5)))
                .isFalse();
    }

    @Test
    void teamLeadDefaultAllowsLeaderButNotRegularUser() {
        stubGrants();
        User leader = user(5);
        when(teamLeadLookup.isAnyTeamLeader(leader)).thenReturn(true);
        assertThat(
                        service.canUseResource(
                                TYPE, RID, null, DefaultAccessPolicy.ADMINS_AND_TEAM_LEADS, leader))
                .isTrue();

        stubGrants();
        assertThat(
                        service.canUseResource(
                                TYPE,
                                RID,
                                null,
                                DefaultAccessPolicy.ADMINS_AND_TEAM_LEADS,
                                user(6)))
                .isFalse();
    }

    // ---- portal convenience (default policy ADMINS_AND_TEAM_LEADS) ----

    @Test
    void portalAccessibleByAdmin() {
        assertThat(service.canAccessPortal(admin(1))).isTrue();
    }

    @Test
    void portalDeniedToRegularUser() {
        when(grantRepository.findByResourceTypeAndResourceId(ResourceType.PORTAL, ""))
                .thenReturn(List.of());
        assertThat(service.canAccessPortal(user(5))).isFalse();
    }

    // ---- helpers ----

    private void stubGrants(ResourceGrant... grants) {
        when(grantRepository.findByResourceTypeAndResourceId(TYPE, RID))
                .thenReturn(List.of(grants));
    }

    private ResourceGrant grant(PrincipalType type, long principalId, AccessPermission permission) {
        ResourceGrant g = new ResourceGrant();
        g.setResourceType(TYPE);
        g.setResourceId(RID);
        g.setPrincipalType(type);
        g.setPrincipalId(principalId);
        g.setPermission(permission);
        return g;
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

    private User userInTeam(long id, long teamId) {
        User u = user(id);
        Team team = new Team();
        team.setId(teamId);
        u.setTeam(team);
        return u;
    }
}
