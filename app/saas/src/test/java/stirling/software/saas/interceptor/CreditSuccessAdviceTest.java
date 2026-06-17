package stirling.software.saas.interceptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.CreditConsumptionResult;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.TeamCreditService;
import stirling.software.saas.util.CreditHeaderUtils;

/**
 * Unit tests for {@link CreditSuccessAdvice}.
 *
 * <p>The advice is a {@code @RestControllerAdvice} {@code ResponseBodyAdvice} that, on a successful
 * (status &lt; 400) response previously flagged credit-eligible (and not already charged), consumes
 * a credit either from the team pool (non-personal team) or via the individual waterfall, then sets
 * {@code X-Credits-Remaining} / {@code X-Credit-Source} headers and increments a {@code
 * credits.consumed} counter. Collaborators are mocked; the {@link MeterRegistry} is a real {@link
 * SimpleMeterRegistry} so the counter is exercised.
 *
 * <p>{@link ServerHttpRequest}/response are constructed by wrapping {@link MockHttpServletRequest}
 * and {@link MockHttpServletResponse} in {@link ServletServerHttpRequest}/{@link
 * ServletServerHttpResponse} so the advice's {@code instanceof} unwrapping and status read work
 * against the mock servlet objects. {@code beforeBodyWrite}'s {@code MethodParameter}, {@code
 * MediaType} and converter type arguments are unused by the charging logic, so {@code null} is
 * passed for them.
 *
 * <p>Authentication is driven through {@link SecurityContextHolder} using a 3-arg {@code
 * UsernamePasswordAuthenticationToken} (authenticated=true) whose principal is the live {@link
 * User} object, so {@code AuthenticationUtils.getCurrentUser} resolves it directly via {@code
 * instanceof User} without touching the repository. The authorities on that token drive the
 * limited-API-user check (which the advice reads from the authentication, not the user).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CreditSuccessAdviceTest {

    private static final String ATTR_ELIGIBLE = "CREDIT_ELIGIBLE";
    private static final String ATTR_APIKEY = "CREDIT_API_KEY";
    private static final String ATTR_CHARGED = "CREDIT_CHARGED";
    private static final String ATTR_RESOURCE_WEIGHT = "CREDIT_RESOURCE_WEIGHT";
    private static final String ATTR_IS_API = "IS_API_REQUEST";

    private static final String API_KEY = "apikey-abcdefgh";

    @Mock private CreditService creditService;
    @Mock private TeamCreditService teamCreditService;
    @Mock private UserRepository userRepository;
    @Mock private SaasTeamExtensionService saasTeamExtensionService;
    @Mock private CreditHeaderUtils creditHeaderUtils;

    private MeterRegistry meterRegistry;
    private CreditSuccessAdvice advice;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        advice =
                new CreditSuccessAdvice(
                        creditService,
                        teamCreditService,
                        userRepository,
                        saasTeamExtensionService,
                        creditHeaderUtils,
                        meterRegistry);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // --- helpers --------------------------------------------------------------------------------

    private static User user(String username) {
        User u = new User();
        u.setUsername(username);
        return u;
    }

    private static Team team(Long id) {
        Team t = new Team();
        t.setId(id);
        return t;
    }

    /** Authenticate with the default ROLE_USER authority (not a limited-API user). */
    private void authenticate(User user) {
        authenticate(user, "ROLE_USER");
    }

    /** Put the user on the SecurityContext as an authenticated principal with given authorities. */
    private void authenticate(User user, String... authorities) {
        var grants = java.util.Arrays.stream(authorities).map(SimpleGrantedAuthority::new).toList();
        UsernamePasswordAuthenticationToken token =
                new UsernamePasswordAuthenticationToken(user, null, grants);
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    /** Base request: credit-eligible with an api key, resource weight 1, not charged. */
    private MockHttpServletRequest eligibleRequest() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setAttribute(ATTR_ELIGIBLE, Boolean.TRUE);
        req.setAttribute(ATTR_APIKEY, API_KEY);
        req.setAttribute(ATTR_RESOURCE_WEIGHT, Integer.valueOf(1));
        return req;
    }

    /** Holder so a test can read back both the returned body and the underlying servlet objects. */
    private static final class Exchange {
        final MockHttpServletRequest servletReq;
        final MockHttpServletResponse servletResp;
        final ServletServerHttpResponse response;

        Exchange(MockHttpServletRequest servletReq, MockHttpServletResponse servletResp) {
            this.servletReq = servletReq;
            this.servletResp = servletResp;
            this.response = new ServletServerHttpResponse(servletResp);
        }

        String header(String name) {
            // Read from the live ServerHttpResponse headers the advice wrote to.
            return response.getHeaders().getFirst(name);
        }
    }

    /**
     * Invoke beforeBodyWrite against the given servlet request/response and return the exchange.
     */
    private Object invoke(Exchange ex, Object body) {
        ServletServerHttpRequest request = new ServletServerHttpRequest(ex.servletReq);
        return advice.beforeBodyWrite(body, null, null, null, request, ex.response);
    }

    private Object invoke(MockHttpServletRequest servletReq, Object body) {
        return invoke(new Exchange(servletReq, new MockHttpServletResponse()), body);
    }

    private double counter() {
        return meterRegistry.get("credits.consumed").counter().count();
    }

    // --- supports() -----------------------------------------------------------------------------

    @Test
    @DisplayName("supports() returns true for any return type / converter")
    void supports_alwaysTrue() {
        assertThat(advice.supports(null, null)).isTrue();
    }

    // --- gates that short-circuit (body returned unchanged, nothing consumed) --------------------

    @Nested
    @DisplayName("short-circuit gates -> body returned unchanged, no consumption")
    class Gates {

        @Test
        @DisplayName("non-servlet request: returns body untouched, no interactions")
        void nonServletRequest_returnsBody() {
            ServerHttpRequest notServlet = org.mockito.Mockito.mock(ServerHttpRequest.class);
            ServletServerHttpResponse resp =
                    new ServletServerHttpResponse(new MockHttpServletResponse());

            Object body = "BODY";
            Object out = advice.beforeBodyWrite(body, null, null, null, notServlet, resp);

            assertThat(out).isSameAs(body);
            verifyNoInteractions(creditService, teamCreditService, creditHeaderUtils);
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName("not eligible (attribute absent): no consumption")
        void notEligible_noConsumption() {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.setAttribute(ATTR_APIKEY, API_KEY);

            Object out = invoke(req, "BODY");

            assertThat(out).isEqualTo("BODY");
            verifyNoInteractions(creditService, teamCreditService, creditHeaderUtils);
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName("eligible attribute not Boolean.TRUE (e.g. Boolean.FALSE): no consumption")
        void eligibleFalse_noConsumption() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_ELIGIBLE, Boolean.FALSE);
            authenticate(user("x"));

            invoke(req, "BODY");

            verifyNoInteractions(creditService, teamCreditService, creditHeaderUtils);
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName("already charged (CREDIT_CHARGED set): no second consumption")
        void alreadyCharged_noConsumption() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_CHARGED, Boolean.TRUE);
            authenticate(user("x"));

            invoke(req, "BODY");

            verifyNoInteractions(creditService, teamCreditService, creditHeaderUtils);
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName("error status >= 400 on response: skip consumption, error advice decides")
        void errorStatus_skipsConsumption() {
            MockHttpServletRequest req = eligibleRequest();
            authenticate(user("x"));
            MockHttpServletResponse servletResp = new MockHttpServletResponse();
            servletResp.setStatus(500);
            Exchange ex = new Exchange(req, servletResp);

            Object out = invoke(ex, "BODY");

            assertThat(out).isEqualTo("BODY");
            verifyNoInteractions(creditService, teamCreditService, creditHeaderUtils);
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName("status exactly 400 is treated as error -> skip")
        void status400_skipsConsumption() {
            MockHttpServletRequest req = eligibleRequest();
            authenticate(user("x"));
            MockHttpServletResponse servletResp = new MockHttpServletResponse();
            servletResp.setStatus(400);

            invoke(new Exchange(req, servletResp), "BODY");

            verifyNoInteractions(creditService, teamCreditService, creditHeaderUtils);
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName("status 399 (just below 400) still consumes")
        void status399_stillConsumes() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("edge");
            authenticate(u);
            MockHttpServletResponse servletResp = new MockHttpServletResponse();
            servletResp.setStatus(399);
            Exchange ex = new Exchange(req, servletResp);

            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(5);

            invoke(ex, "BODY");

            assertThat(counter()).isEqualTo(1.0d);
            verify(creditService).consumeCreditWithWaterfall(u, 1, false);
        }

        @Test
        @DisplayName("eligible but apiKey attribute absent: no consumption (apiKey != null guard)")
        void nullApiKey_noConsumption() {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.setAttribute(ATTR_ELIGIBLE, Boolean.TRUE);
            req.setAttribute(ATTR_RESOURCE_WEIGHT, Integer.valueOf(1));
            // no ATTR_APIKEY -> apiKey null
            authenticate(user("x"));

            invoke(req, "BODY");

            verifyNoInteractions(creditService, teamCreditService, creditHeaderUtils);
            assertThat(counter()).isZero();
        }
    }

    // --- individual (waterfall) consumption -----------------------------------------------------

    @Nested
    @DisplayName("individual credit consumption (no team)")
    class IndividualConsumption {

        @Test
        @DisplayName("waterfall success: marks charged, increments counter, sets both headers")
        void waterfallSuccess_chargesAndHeaders() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_RESOURCE_WEIGHT, Integer.valueOf(3));
            req.setAttribute(ATTR_IS_API, Boolean.TRUE);
            User u = user("alice");
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(creditService.consumeCreditWithWaterfall(u, 3, true))
                    .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(42);

            Object out = invoke(ex, "BODY");

            assertThat(out).isEqualTo("BODY");
            assertThat(req.getAttribute(ATTR_CHARGED)).isEqualTo(Boolean.TRUE);
            assertThat(counter()).isEqualTo(1.0d);
            assertThat(ex.header("X-Credits-Remaining")).isEqualTo("42");
            assertThat(ex.header("X-Credit-Source")).isEqualTo("CYCLE_CREDITS");
            verify(creditService).consumeCreditWithWaterfall(u, 3, true);
            verify(teamCreditService, never()).consumeCreditWithWaterfall(anyLong(), anyInt());
        }

        @Test
        @DisplayName("resource weight absent defaults credit amount to 1, IS_API absent -> false")
        void weightAbsent_defaultsToOne() {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.setAttribute(ATTR_ELIGIBLE, Boolean.TRUE);
            req.setAttribute(ATTR_APIKEY, API_KEY);
            // no resource weight, no IS_API_REQUEST -> isApiRequestFlag false
            User u = user("bob");
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("BOUGHT_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(0);

            invoke(ex, "BODY");

            verify(creditService).consumeCreditWithWaterfall(u, 1, false);
            // remaining 0 is non-negative -> header set
            assertThat(ex.header("X-Credits-Remaining")).isEqualTo("0");
            assertThat(ex.header("X-Credit-Source")).isEqualTo("BOUGHT_CREDITS");
        }

        @Test
        @DisplayName("IS_API_REQUEST=false is passed through as false to the waterfall")
        void isApiFalse_passedThrough() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_IS_API, Boolean.FALSE);
            User u = user("ivy");
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(3);

            invoke(ex, "BODY");

            verify(creditService).consumeCreditWithWaterfall(u, 1, false);
        }

        @Test
        @DisplayName(
                "waterfall failure (insufficient credits): not charged, counter zero, no headers")
        void waterfallFailure_notCharged() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("carol");
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.failure("INSUFFICIENT_CREDITS"));

            invoke(ex, "BODY");

            assertThat(req.getAttribute(ATTR_CHARGED)).isNull();
            assertThat(counter()).isZero();
            assertThat(ex.header("X-Credits-Remaining")).isNull();
            assertThat(ex.header("X-Credit-Source")).isNull();
            // header utils is only consulted after a successful charge
            verifyNoInteractions(creditHeaderUtils);
        }

        @Test
        @DisplayName("success but negative remaining: charged + source header, no remaining header")
        void successNegativeRemaining_noRemainingHeader() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("dave");
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("METERED_SUBSCRIPTION"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(-1);

            invoke(ex, "BODY");

            assertThat(req.getAttribute(ATTR_CHARGED)).isEqualTo(Boolean.TRUE);
            assertThat(counter()).isEqualTo(1.0d);
            assertThat(ex.header("X-Credits-Remaining")).isNull();
            assertThat(ex.header("X-Credit-Source")).isEqualTo("METERED_SUBSCRIPTION");
        }

        @Test
        @DisplayName("success with null source: charged, remaining header set, no source header")
        void successNullSource_noSourceHeader() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("erin");
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            // success=true but source=null (defensively handled by the advice)
            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(new CreditConsumptionResult(true, null, "ok"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(7);

            invoke(ex, "BODY");

            assertThat(req.getAttribute(ATTR_CHARGED)).isEqualTo(Boolean.TRUE);
            assertThat(ex.header("X-Credits-Remaining")).isEqualTo("7");
            assertThat(ex.header("X-Credit-Source")).isNull();
        }

        @Test
        @DisplayName("user with personal team is treated as no team -> waterfall, not team pool")
        void personalTeam_usesWaterfall() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("frank");
            u.setTeam(team(99L));
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(true);
            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(5);

            invoke(ex, "BODY");

            verify(creditService).consumeCreditWithWaterfall(u, 1, false);
            verify(teamCreditService, never()).consumeCreditWithWaterfall(anyLong(), anyInt());
        }
    }

    // --- limited-API users always use personal credits ------------------------------------------

    @Nested
    @DisplayName("limited-API users always use personal credits (never team pool)")
    class LimitedApiUsers {

        @Test
        @DisplayName("ROLE_LIMITED_API_USER in a non-personal team still uses the waterfall")
        void limitedApiUser_usesWaterfall() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("lim");
            u.setTeam(team(77L));
            authenticate(u, "ROLE_LIMITED_API_USER");
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(2);

            invoke(ex, "BODY");

            verify(creditService).consumeCreditWithWaterfall(u, 1, false);
            verify(teamCreditService, never()).consumeCreditWithWaterfall(anyLong(), anyInt());
            // isPersonal short-circuited by the limited-API check; team service untouched
            verify(saasTeamExtensionService, never()).isPersonal(any());
        }

        @Test
        @DisplayName("ROLE_EXTRA_LIMITED_API_USER in a non-personal team still uses the waterfall")
        void extraLimitedApiUser_usesWaterfall() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("xlim");
            u.setTeam(team(88L));
            authenticate(u, "ROLE_EXTRA_LIMITED_API_USER");
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(1);

            invoke(ex, "BODY");

            verify(creditService).consumeCreditWithWaterfall(u, 1, false);
            verify(teamCreditService, never()).consumeCreditWithWaterfall(anyLong(), anyInt());
        }
    }

    // --- team consumption -----------------------------------------------------------------------

    @Nested
    @DisplayName("team credit consumption (non-personal team)")
    class TeamConsumption {

        @Test
        @DisplayName("non-personal team success: consumes from team pool, sets source header")
        void teamSuccess_consumesTeamPool() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_RESOURCE_WEIGHT, Integer.valueOf(2));
            User u = user("gina");
            u.setTeam(team(77L));
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(teamCreditService.consumeCreditWithWaterfall(77L, 2))
                    .thenReturn(CreditConsumptionResult.success("TEAM_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(100);

            Object out = invoke(ex, "BODY");

            assertThat(out).isEqualTo("BODY");
            assertThat(req.getAttribute(ATTR_CHARGED)).isEqualTo(Boolean.TRUE);
            assertThat(counter()).isEqualTo(1.0d);
            assertThat(ex.header("X-Credit-Source")).isEqualTo("TEAM_CREDITS");
            assertThat(ex.header("X-Credits-Remaining")).isEqualTo("100");
            verify(teamCreditService).consumeCreditWithWaterfall(77L, 2);
            verify(creditService, never())
                    .consumeCreditWithWaterfall(any(), anyInt(), anyBoolean());
        }

        @Test
        @DisplayName("non-personal team success via leader overage source is propagated")
        void teamSuccess_overageSourcePropagated() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("greg");
            u.setTeam(team(12L));
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(teamCreditService.consumeCreditWithWaterfall(12L, 1))
                    .thenReturn(CreditConsumptionResult.success("METERED_SUBSCRIPTION"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(0);

            invoke(ex, "BODY");

            assertThat(ex.header("X-Credit-Source")).isEqualTo("METERED_SUBSCRIPTION");
        }

        @Test
        @DisplayName("non-personal team failure: not charged, counter zero, no headers")
        void teamFailure_notCharged() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("hank");
            u.setTeam(team(55L));
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(teamCreditService.consumeCreditWithWaterfall(55L, 1))
                    .thenReturn(
                            CreditConsumptionResult.failure("TEAM_CREDITS_EXHAUSTED_NO_OVERAGE"));

            invoke(ex, "BODY");

            assertThat(req.getAttribute(ATTR_CHARGED)).isNull();
            assertThat(counter()).isZero();
            assertThat(ex.header("X-Credits-Remaining")).isNull();
            assertThat(ex.header("X-Credit-Source")).isNull();
            verify(creditService, never())
                    .consumeCreditWithWaterfall(any(), anyInt(), anyBoolean());
            verifyNoInteractions(creditHeaderUtils);
        }

        @Test
        @DisplayName("team with null id is treated as no team -> waterfall used")
        void teamNullId_usesWaterfall() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("nina");
            u.setTeam(team(null)); // non-personal (isPersonal false) but id null
            authenticate(u);
            Exchange ex = new Exchange(req, new MockHttpServletResponse());

            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(4);

            invoke(ex, "BODY");

            // targetTeamId resolves to null (team id null) -> individual waterfall
            verify(creditService).consumeCreditWithWaterfall(u, 1, false);
            verify(teamCreditService, never()).consumeCreditWithWaterfall(anyLong(), anyInt());
        }
    }

    // --- user resolution edge cases -------------------------------------------------------------

    @Nested
    @DisplayName("user resolution edge cases")
    class UserResolution {

        @Test
        @DisplayName("no authentication: getCurrentUser throws, user null -> no consumption")
        void noAuth_userNull_noConsumption() {
            MockHttpServletRequest req = eligibleRequest();
            // no SecurityContext authentication -> AuthenticationUtils throws SecurityException

            Object out = invoke(req, "BODY");

            assertThat(out).isEqualTo("BODY");
            assertThat(req.getAttribute(ATTR_CHARGED)).isNull();
            assertThat(counter()).isZero();
            verifyNoInteractions(creditService, teamCreditService, creditHeaderUtils);
        }
    }

    // --- counter accumulation -------------------------------------------------------------------

    @Test
    @DisplayName("counter accumulates across multiple successful charges")
    void counterAccumulates() {
        User u = user("mike");
        when(creditService.consumeCreditWithWaterfall(u, 1, false))
                .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
        when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                .thenReturn(3);

        // fresh request each time so ATTR_CHARGED from a prior call doesn't block the next
        authenticate(u);
        invoke(eligibleRequest(), "A");
        invoke(eligibleRequest(), "B");

        assertThat(counter()).isEqualTo(2.0d);
        verify(creditService, times(2)).consumeCreditWithWaterfall(u, 1, false);
    }

    @Test
    @DisplayName("body is always returned verbatim (including null) regardless of charging")
    void bodyReturnedVerbatim() {
        User u = user("nora");
        authenticate(u);
        when(creditService.consumeCreditWithWaterfall(u, 1, false))
                .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
        when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                .thenReturn(1);

        Object out = invoke(eligibleRequest(), null);

        assertThat(out).isNull();
    }
}
