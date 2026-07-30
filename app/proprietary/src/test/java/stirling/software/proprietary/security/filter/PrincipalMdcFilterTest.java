package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

class PrincipalMdcFilterTest {

    private final PrincipalMdcFilter filter = new PrincipalMdcFilter();

    @AfterEach
    void cleanUp() {
        SecurityContextHolder.clearContext();
        MDC.remove(PrincipalMdcFilter.MDC_KEY);
    }

    @Test
    void stampsAuthenticatedPrincipalDuringTheChainAndClearsAfter() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "alice", "n/a", AuthorityUtils.createAuthorityList("ROLE_USER")));
        String[] seen = new String[1];

        filter.doFilter(
                new MockHttpServletRequest(),
                new MockHttpServletResponse(),
                (req, res) -> seen[0] = MDC.get(PrincipalMdcFilter.MDC_KEY));

        assertEquals("alice", seen[0]);
        assertNull(MDC.get(PrincipalMdcFilter.MDC_KEY));
    }

    @Test
    void anonymousRequestsAreNotStamped() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));
        String[] seen = new String[] {"sentinel"};

        filter.doFilter(
                new MockHttpServletRequest(),
                new MockHttpServletResponse(),
                (req, res) -> seen[0] = MDC.get(PrincipalMdcFilter.MDC_KEY));

        assertNull(seen[0]);
    }

    @Test
    void existingMdcPrincipalIsLeftUntouched() throws Exception {
        MDC.put(PrincipalMdcFilter.MDC_KEY, "policy-run-owner");
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "alice", "n/a", AuthorityUtils.createAuthorityList("ROLE_USER")));
        String[] seen = new String[1];

        filter.doFilter(
                new MockHttpServletRequest(),
                new MockHttpServletResponse(),
                (req, res) -> seen[0] = MDC.get(PrincipalMdcFilter.MDC_KEY));

        assertEquals("policy-run-owner", seen[0]);
        assertEquals("policy-run-owner", MDC.get(PrincipalMdcFilter.MDC_KEY));
    }
}
