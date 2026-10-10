package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import jakarta.servlet.FilterChain;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.service.TeamMemberCapacityService;

class MemberCapacityFilterTest {

    private final TeamMemberCapacityService capacity = mock(TeamMemberCapacityService.class);
    private final TeamMembershipRepository memberships = mock(TeamMembershipRepository.class);
    private final MemberCapacityFilter filter = new MemberCapacityFilter(capacity, memberships);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void signedIn(long userId) {
        Team team = new Team();
        team.setId(42L);
        team.setName("Acme");
        User user = new User();
        user.setId(userId);
        user.setUsername("member" + userId);
        user.setTeam(team);
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(user, null));
    }

    private MockHttpServletResponse call(String method, String path, FilterChain chain)
            throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest(method, path), response, chain);
        return response;
    }

    @Test
    void aDisabledMemberIsRefusedWithTheTeamAndItsLeaders() throws Exception {
        signedIn(7L);
        when(capacity.isDisabled(42L, 7L)).thenReturn(true);
        User leader = new User();
        leader.setEmail("alex@acme.example");
        TeamMembership leaderRow = new TeamMembership();
        leaderRow.setUser(leader);
        when(memberships.findByTeamIdAndRole(42L, TeamRole.LEADER)).thenReturn(List.of(leaderRow));
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletResponse response = call("GET", "/api/v1/payg/wallet", chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString())
                .contains("\"error\":\"MEMBER_OVER_PLAN_LIMIT\"")
                .contains("\"teamId\":42")
                .contains("\"teamName\":\"Acme\"")
                .contains("alex@acme.example");
        verifyNoInteractions(chain);
    }

    @Test
    void aMemberWithAPlaceGoesThrough() throws Exception {
        signedIn(7L);
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse response = call("GET", "/api/v1/payg/wallet", chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void leavingTheTeamStaysOpen() throws Exception {
        signedIn(7L);
        when(capacity.isDisabled(42L, 7L)).thenReturn(true);
        MockFilterChain chain = new MockFilterChain();

        call("POST", "/api/v1/team/42/leave", chain);

        assertThat(chain.getRequest()).isNotNull();
        verifyNoInteractions(capacity);
    }

    @Test
    void onlyApiPathsAreChecked() throws Exception {
        signedIn(7L);
        MockFilterChain chain = new MockFilterChain();

        call("GET", "/settings/billing", chain);

        assertThat(chain.getRequest()).isNotNull();
        verifyNoInteractions(capacity);
    }

    @Test
    void anonymousRequestsAreNotChecked() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/config/app");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        verifyNoInteractions(capacity);
    }
}
