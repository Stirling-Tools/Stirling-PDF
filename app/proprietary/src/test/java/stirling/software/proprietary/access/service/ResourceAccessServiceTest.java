package stirling.software.proprietary.access.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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

@ExtendWith(MockitoExtension.class)
class ResourceAccessServiceTest {

    private static final ResourceType TYPE = ResourceType.INTEGRATION_CONFIG;
    private static final String RID = "42";
    private static final long ORG_ID = 1L;

    @Mock private ResourceGrantRepository grantRepository;
    @Mock private TeamLeadLookup teamLeadLookup;

    private ResourceAccessService service;

    @BeforeEach
    void setUp() throws Exception {
        service = newService(new DefaultPrincipalResolver(ORG_ID));
    }

    private ResourceAccessService newService(PrincipalResolver resolver) throws Exception {
        ResourceAccessService s =
                new ResourceAccessService(grantRepository, teamLeadLookup, resolver);
        Field f = ResourceAccessService.class.getDeclaredField("portalDefaultPolicy");
        f.setAccessible(true);
        f.set(s, DefaultAccessPolicy.ADMINS_AND_TEAM_LEADS);
        return s;
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
                                TYPE,
                                RID,
                                PrincipalRef.user(5L),
                                DefaultAccessPolicy.EXPLICIT_ONLY,
                                user(5)))
                .isTrue();
    }

    @Test
    void nullUserIsAlwaysDenied() {
        assertThat(
                        service.canUseResource(
                                TYPE,
                                RID,
                                PrincipalRef.user(5L),
                                DefaultAccessPolicy.ORG_ALL,
                                null))
                .isFalse();
        assertThat(service.canManageResource(TYPE, RID, PrincipalRef.user(5L), null)).isFalse();
    }

    // ---- owner refs ----

    @Test
    void teamOwnerRefAllowsLeaderOfThatTeam() {
        User leader = userInTeam(5, 7);
        when(teamLeadLookup.isLeaderOfTeam(leader, 7L)).thenReturn(true);
        assertThat(
                        service.canUseResource(
                                TYPE,
                                RID,
                                PrincipalRef.team(7L),
                                DefaultAccessPolicy.EXPLICIT_ONLY,
                                leader))
                .isTrue();
        assertThat(service.canManageResource(TYPE, RID, PrincipalRef.team(7L), leader)).isTrue();
    }

    @Test
    void teamOwnerRefDeniesPlainTeamMember() {
        stubGrants();
        User member = userInTeam(5, 7);
        assertThat(
                        service.canUseResource(
                                TYPE,
                                RID,
                                PrincipalRef.team(7L),
                                DefaultAccessPolicy.EXPLICIT_ONLY,
                                member))
                .isFalse();
    }

    @Test
    void orgOwnerRefNeverGrantsOwnership() {
        stubGrants();
        assertThat(
                        service.canUseResource(
                                TYPE,
                                RID,
                                PrincipalRef.org(ORG_ID),
                                DefaultAccessPolicy.EXPLICIT_ONLY,
                                user(5)))
                .isFalse();
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
    void orgGrantAllowsAnyUserWhoseResolverProjectsOrg() {
        stubGrants(grant(PrincipalType.ORG, ORG_ID, AccessPermission.USE));
        assertThat(
                        service.canUseResource(
                                TYPE, RID, null, DefaultAccessPolicy.EXPLICIT_ONLY, user(5)))
                .isTrue();
    }

    @Test
    void orgGrantForAnotherOrgIdDoesNotMatch() {
        stubGrants(grant(PrincipalType.ORG, 2L, AccessPermission.USE));
        assertThat(
                        service.canUseResource(
                                TYPE, RID, null, DefaultAccessPolicy.EXPLICIT_ONLY, user(5)))
                .isFalse();
    }

    @Test
    void orgGrantIsInertWhenResolverProjectsNoOrg() throws Exception {
        // Mirrors the saas resolver: USER/TEAM only, so ORG grants never match.
        ResourceAccessService noOrg =
                newService(u -> u == null ? Set.of() : Set.of(PrincipalRef.user(u.getId())));
        stubGrants(grant(PrincipalType.ORG, ORG_ID, AccessPermission.USE));
        assertThat(
                        noOrg.canUseResource(
                                TYPE, RID, null, DefaultAccessPolicy.EXPLICIT_ONLY, user(5)))
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

    // ---- upsert semantics ----

    @Test
    void grantOverwritesPermissionEvenDowngrading() {
        // Upsert key is (type, resourceId, principalType, principalId); permission is overwritten.
        ResourceGrant existing = grant(PrincipalType.USER, 5L, AccessPermission.MANAGE);
        stubGrants(existing);
        when(grantRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ResourceGrant saved =
                service.grant(TYPE, RID, PrincipalType.USER, 5L, AccessPermission.USE, null);

        assertThat(saved).isSameAs(existing);
        assertThat(saved.getPermission()).isEqualTo(AccessPermission.USE);
    }

    // ---- granted resource ids ----

    @Test
    void grantedResourceIdsCollectsAcrossAllPrincipals() {
        when(grantRepository.findByResourceTypeAndPrincipalTypeAndPrincipalId(
                        TYPE, PrincipalType.USER, 5L))
                .thenReturn(List.of(grantOn("a")));
        when(grantRepository.findByResourceTypeAndPrincipalTypeAndPrincipalId(
                        TYPE, PrincipalType.TEAM, 7L))
                .thenReturn(List.of(grantOn("b")));
        when(grantRepository.findByResourceTypeAndPrincipalTypeAndPrincipalId(
                        TYPE, PrincipalType.ORG, ORG_ID))
                .thenReturn(List.of(grantOn("c")));

        assertThat(service.grantedResourceIds(TYPE, userInTeam(5, 7)))
                .containsExactlyInAnyOrder("a", "b", "c");
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

    private ResourceGrant grantOn(String resourceId) {
        ResourceGrant g = grant(PrincipalType.USER, 5L, AccessPermission.USE);
        g.setResourceId(resourceId);
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
