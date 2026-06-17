package stirling.software.saas.interceptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

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
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
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
import stirling.software.saas.service.ErrorTrackingService;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.TeamCreditService;
import stirling.software.saas.util.CreditHeaderUtils;

/**
 * Unit tests for {@link CreditErrorAdvice}.
 *
 * <p>The advice is a {@code @RestControllerAdvice} that maps thrown exceptions to a status/body
 * and, when the request was flagged eligible (and not already charged), consumes a credit through
 * either the team pool or the individual waterfall. Collaborators are mocked; the {@link
 * MeterRegistry} is a real {@link SimpleMeterRegistry} so the {@code credits.consumed} counter is
 * exercised.
 *
 * <p>Authentication is driven through {@link SecurityContextHolder} using a 3-arg {@code
 * UsernamePasswordAuthenticationToken} (authenticated=true) whose principal is the live {@link
 * User} object, so {@code AuthenticationUtils.getCurrentUser} resolves it directly via {@code
 * instanceof User} without touching the repository.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CreditErrorAdviceTest {

    private static final String ATTR_ELIGIBLE = "CREDIT_ELIGIBLE";
    private static final String ATTR_APIKEY = "CREDIT_API_KEY";
    private static final String ATTR_CHARGED = "CREDIT_CHARGED";
    private static final String ATTR_RESOURCE_WEIGHT = "CREDIT_RESOURCE_WEIGHT";
    private static final String ATTR_IS_API = "IS_API_REQUEST";

    private static final String API_KEY = "apikey-abcdefgh";
    private static final String URI = "/api/v1/convert/pdf-to-img";

    @Mock private CreditService creditService;
    @Mock private TeamCreditService teamCreditService;
    @Mock private UserRepository userRepository;
    @Mock private ErrorTrackingService errorTrackingService;
    @Mock private SaasTeamExtensionService saasTeamExtensionService;
    @Mock private CreditHeaderUtils creditHeaderUtils;

    private MeterRegistry meterRegistry;
    private CreditErrorAdvice advice;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        advice =
                new CreditErrorAdvice(
                        creditService,
                        teamCreditService,
                        userRepository,
                        errorTrackingService,
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

    /** Put the user on the SecurityContext as an authenticated principal. */
    private void authenticate(User user) {
        UsernamePasswordAuthenticationToken token =
                new UsernamePasswordAuthenticationToken(
                        user, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    /** Base request that is credit-eligible with an api key, resource weight 1 and not charged. */
    private MockHttpServletRequest eligibleRequest() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI(URI);
        req.setAttribute(ATTR_ELIGIBLE, Boolean.TRUE);
        req.setAttribute(ATTR_APIKEY, API_KEY);
        req.setAttribute(ATTR_RESOURCE_WEIGHT, Integer.valueOf(1));
        return req;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> bodyOf(ResponseEntity<Object> resp) {
        return (Map<String, Object>) resp.getBody();
    }

    private double counter() {
        return meterRegistry.get("credits.consumed").counter().count();
    }

    // --- status mapping -------------------------------------------------------------------------

    @Nested
    @DisplayName("determineHttpStatus mapping (via handleThrowable)")
    class StatusMapping {

        @Test
        @DisplayName("IllegalArgumentException -> 400 BAD_REQUEST")
        void illegalArgument_400() {
            MockHttpServletRequest req = new MockHttpServletRequest();

            ResponseEntity<Object> resp =
                    advice.handleThrowable(req, new IllegalArgumentException("bad"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(bodyOf(resp))
                    .containsEntry("error", "IllegalArgumentException")
                    .containsEntry("message", "bad")
                    .containsEntry("status", 400);
        }

        @Test
        @DisplayName("AccessDeniedException -> 403 FORBIDDEN")
        void accessDenied_403() {
            MockHttpServletRequest req = new MockHttpServletRequest();

            ResponseEntity<Object> resp =
                    advice.handleThrowable(
                            req,
                            new org.springframework.security.access.AccessDeniedException("nope"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        @DisplayName("UsernameNotFoundException -> 401 UNAUTHORIZED")
        void usernameNotFound_401() {
            MockHttpServletRequest req = new MockHttpServletRequest();

            ResponseEntity<Object> resp =
                    advice.handleThrowable(
                            req,
                            new org.springframework.security.core.userdetails
                                    .UsernameNotFoundException("who"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        @DisplayName("UnsupportedOperationException -> 501 NOT_IMPLEMENTED")
        void unsupported_501() {
            MockHttpServletRequest req = new MockHttpServletRequest();

            ResponseEntity<Object> resp =
                    advice.handleThrowable(req, new UnsupportedOperationException("later"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_IMPLEMENTED);
        }

        @Test
        @DisplayName("unknown exception with no message clue -> 500 INTERNAL_SERVER_ERROR")
        void unknown_500() {
            MockHttpServletRequest req = new MockHttpServletRequest();

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("boom"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }

        @Test
        @DisplayName("message containing 'not found' -> 404 NOT_FOUND")
        void messageNotFound_404() {
            MockHttpServletRequest req = new MockHttpServletRequest();

            ResponseEntity<Object> resp =
                    advice.handleThrowable(req, new RuntimeException("Resource not found here"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        @DisplayName("message containing 'validation' -> 400 BAD_REQUEST")
        void messageValidation_400() {
            MockHttpServletRequest req = new MockHttpServletRequest();

            ResponseEntity<Object> resp =
                    advice.handleThrowable(req, new RuntimeException("Validation of input failed"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("message containing 'invalid parameter' -> 400 BAD_REQUEST")
        void messageInvalidParameter_400() {
            MockHttpServletRequest req = new MockHttpServletRequest();

            ResponseEntity<Object> resp =
                    advice.handleThrowable(req, new RuntimeException("invalid parameter: x"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("null message falls back to 'An error occurred' and 500")
        void nullMessage_default() {
            MockHttpServletRequest req = new MockHttpServletRequest();

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException());

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(bodyOf(resp)).containsEntry("message", "An error occurred");
        }
    }

    // --- no credit handling (gates closed) ------------------------------------------------------

    @Nested
    @DisplayName("credit handling gate is closed -> no consumption")
    class GateClosed {

        @Test
        @DisplayName("request not eligible: no error tracking, no consumption")
        void notEligible_noConsumption() {
            MockHttpServletRequest req = new MockHttpServletRequest();
            // ATTR_ELIGIBLE absent

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            verifyNoInteractions(errorTrackingService, creditService, teamCreditService);
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName("eligible but already charged and unauthenticated: no consumption, no header")
        void alreadyCharged_unauthenticated_noHeader() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_CHARGED, Boolean.TRUE);
            // no SecurityContext authentication

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            verifyNoInteractions(errorTrackingService, creditService, teamCreditService);
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isNull();
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName(
                "eligible, null api key: error tracking is skipped entirely (apiKey != null guard)")
        void eligibleNullApiKey_noTracking() {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.setRequestURI(URI);
            req.setAttribute(ATTR_ELIGIBLE, Boolean.TRUE);
            req.setAttribute(ATTR_RESOURCE_WEIGHT, Integer.valueOf(1));
            // no ATTR_APIKEY -> apiKey is null

            advice.handleThrowable(req, new RuntimeException("x"));

            verifyNoInteractions(errorTrackingService, creditService, teamCreditService);
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName("eligible with api key but tracking says do NOT consume: no charge")
        void trackingSaysNo_noConsumption() {
            MockHttpServletRequest req = eligibleRequest();
            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(false);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            verify(errorTrackingService)
                    .recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), eq(500));
            verifyNoInteractions(creditService, teamCreditService);
            assertThat(req.getAttribute(ATTR_CHARGED)).isNull();
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

            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);
            when(creditService.consumeCreditWithWaterfall(u, 3, true))
                    .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(42);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(req.getAttribute(ATTR_CHARGED)).isEqualTo(Boolean.TRUE);
            assertThat(counter()).isEqualTo(1.0d);
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("42");
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isEqualTo("CYCLE_CREDITS");
            verify(creditService).consumeCreditWithWaterfall(u, 3, true);
            verify(teamCreditService, never()).consumeCredit(any(), anyInt());
        }

        @Test
        @DisplayName("resource weight absent defaults credit amount to 1")
        void weightAbsent_defaultsToOne() {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.setRequestURI(URI);
            req.setAttribute(ATTR_ELIGIBLE, Boolean.TRUE);
            req.setAttribute(ATTR_APIKEY, API_KEY);
            // no resource weight, no IS_API_REQUEST -> isApiRequestFlag false
            User u = user("bob");
            authenticate(u);

            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);
            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("BOUGHT_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(0);

            advice.handleThrowable(req, new RuntimeException("x"));

            verify(creditService).consumeCreditWithWaterfall(u, 1, false);
        }

        @Test
        @DisplayName("waterfall failure: not charged, counter stays zero, no headers")
        void waterfallFailure_notCharged() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("carol");
            authenticate(u);

            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);
            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.failure("INSUFFICIENT_CREDITS"));

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(req.getAttribute(ATTR_CHARGED)).isNull();
            assertThat(counter()).isZero();
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isNull();
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isNull();
        }

        @Test
        @DisplayName("success but negative remaining: charged + source header, no remaining header")
        void successNegativeRemaining_noRemainingHeader() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("dave");
            authenticate(u);

            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);
            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("METERED_SUBSCRIPTION"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(-1);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(req.getAttribute(ATTR_CHARGED)).isEqualTo(Boolean.TRUE);
            assertThat(counter()).isEqualTo(1.0d);
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isNull();
            assertThat(resp.getHeaders().getFirst("X-Credit-Source"))
                    .isEqualTo("METERED_SUBSCRIPTION");
        }

        @Test
        @DisplayName("success with null source: charged, remaining header set, no source header")
        void successNullSource_noSourceHeader() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("erin");
            authenticate(u);

            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);
            // success=true but source=null (unusual but defensively handled by the advice)
            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(new CreditConsumptionResult(true, null, "ok"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(7);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(req.getAttribute(ATTR_CHARGED)).isEqualTo(Boolean.TRUE);
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("7");
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isNull();
        }

        @Test
        @DisplayName("personal team is treated as no team -> waterfall, not team pool")
        void personalTeam_usesWaterfall() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("frank");
            u.setTeam(team(99L));
            authenticate(u);

            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(true);
            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);
            when(creditService.consumeCreditWithWaterfall(u, 1, false))
                    .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(5);

            advice.handleThrowable(req, new RuntimeException("x"));

            verify(creditService).consumeCreditWithWaterfall(u, 1, false);
            verify(teamCreditService, never()).consumeCredit(any(), anyInt());
        }
    }

    // --- team consumption -----------------------------------------------------------------------

    @Nested
    @DisplayName("team credit consumption (non-personal team)")
    class TeamConsumption {

        @Test
        @DisplayName("non-personal team success: consumes from team pool, source TEAM_CREDITS")
        void teamSuccess_consumesTeamPool() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_RESOURCE_WEIGHT, Integer.valueOf(2));
            User u = user("gina");
            u.setTeam(team(77L));
            authenticate(u);

            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);
            when(teamCreditService.consumeCredit(77L, 2)).thenReturn(true);
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(100);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(req.getAttribute(ATTR_CHARGED)).isEqualTo(Boolean.TRUE);
            assertThat(counter()).isEqualTo(1.0d);
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isEqualTo("TEAM_CREDITS");
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("100");
            verify(teamCreditService).consumeCredit(77L, 2);
            verify(creditService, never())
                    .consumeCreditWithWaterfall(any(), anyInt(), anyBoolean());
        }

        @Test
        @DisplayName("non-personal team failure: not charged, counter stays zero")
        void teamFailure_notCharged() {
            MockHttpServletRequest req = eligibleRequest();
            User u = user("hank");
            u.setTeam(team(55L));
            authenticate(u);

            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);
            when(teamCreditService.consumeCredit(55L, 1)).thenReturn(false);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(req.getAttribute(ATTR_CHARGED)).isNull();
            assertThat(counter()).isZero();
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isNull();
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isNull();
            verify(creditService, never())
                    .consumeCreditWithWaterfall(any(), anyInt(), anyBoolean());
        }
    }

    // --- user resolution edge cases -------------------------------------------------------------

    @Nested
    @DisplayName("user resolution edge cases (tracking says consume)")
    class UserResolution {

        @Test
        @DisplayName("no authentication: getCurrentUser throws, user null -> no consumption")
        void noAuth_userNull_noConsumption() {
            MockHttpServletRequest req = eligibleRequest();
            // no SecurityContext authentication -> AuthenticationUtils throws SecurityException
            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(req.getAttribute(ATTR_CHARGED)).isNull();
            assertThat(counter()).isZero();
            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            verifyNoInteractions(creditService, teamCreditService);
        }
    }

    // --- already-charged header path ------------------------------------------------------------

    @Nested
    @DisplayName("already-charged path sets remaining header when authenticated")
    class AlreadyCharged {

        @Test
        @DisplayName(
                "already charged + authenticated + non-negative remaining: header set, no consumption")
        void alreadyCharged_authenticated_setsHeader() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_CHARGED, Boolean.TRUE);
            User u = user("ian");
            authenticate(u);
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(9);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("9");
            // Already-charged branch never records an error or consumes again.
            verifyNoInteractions(errorTrackingService, teamCreditService);
            verify(creditService, never())
                    .consumeCreditWithWaterfall(any(), anyInt(), anyBoolean());
            assertThat(counter()).isZero();
        }

        @Test
        @DisplayName("already charged + authenticated + negative remaining: no header")
        void alreadyCharged_negativeRemaining_noHeader() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_CHARGED, Boolean.TRUE);
            User u = user("jane");
            authenticate(u);
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(-1);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isNull();
        }

        @Test
        @DisplayName("already charged: header lookup throwing is swallowed (no propagation)")
        void alreadyCharged_headerLookupThrows_swallowed() {
            MockHttpServletRequest req = eligibleRequest();
            req.setAttribute(ATTR_CHARGED, Boolean.TRUE);
            User u = user("kyle");
            authenticate(u);
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenThrow(new RuntimeException("header boom"));

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            // Must not propagate; status still computed and no remaining header set.
            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isNull();
        }
    }

    // --- SSE response shaping --------------------------------------------------------------------

    @Nested
    @DisplayName("SSE response shaping")
    class SseShaping {

        @Test
        @DisplayName("Accept text/event-stream: body is SSE framed text with event: error")
        void acceptHeader_producesSseBody() {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.addHeader("Accept", MediaType.TEXT_EVENT_STREAM_VALUE);

            ResponseEntity<Object> resp =
                    advice.handleThrowable(req, new IllegalArgumentException("bad"));

            assertThat(resp.getHeaders().getContentType()).isEqualTo(MediaType.TEXT_EVENT_STREAM);
            assertThat(resp.getBody()).isInstanceOf(String.class);
            String sse = (String) resp.getBody();
            assertThat(sse).startsWith("event: error\ndata: ").endsWith("\n\n");
            assertThat(sse).contains("\"error\":\"IllegalArgumentException\"");
            assertThat(sse).contains("\"status\":400");
        }

        @Test
        @DisplayName("Content-Type text/event-stream also triggers SSE framing")
        void contentTypeHeader_producesSseBody() {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.setContentType(MediaType.TEXT_EVENT_STREAM_VALUE);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("boom"));

            assertThat(resp.getHeaders().getContentType()).isEqualTo(MediaType.TEXT_EVENT_STREAM);
            assertThat((String) resp.getBody()).startsWith("event: error\ndata: ");
        }

        @Test
        @DisplayName("non-SSE request returns the Map body, not SSE text")
        void nonSse_returnsMapBody() {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.addHeader("Accept", MediaType.APPLICATION_JSON_VALUE);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("boom"));

            assertThat(resp.getBody()).isInstanceOf(Map.class);
            assertThat(resp.getHeaders().getContentType()).isNull();
        }

        @Test
        @DisplayName(
                "SSE framing carries through after a successful team charge (headers + SSE body)")
        void sseWithTeamCharge_headersAndSseBody() {
            MockHttpServletRequest req = eligibleRequest();
            req.addHeader("Accept", MediaType.TEXT_EVENT_STREAM_VALUE);
            User u = user("liz");
            u.setTeam(team(33L));
            authenticate(u);

            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                            eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                    .thenReturn(true);
            when(teamCreditService.consumeCredit(33L, 1)).thenReturn(true);
            when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                    .thenReturn(8);

            ResponseEntity<Object> resp = advice.handleThrowable(req, new RuntimeException("x"));

            assertThat(resp.getHeaders().getContentType()).isEqualTo(MediaType.TEXT_EVENT_STREAM);
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isEqualTo("TEAM_CREDITS");
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("8");
            assertThat((String) resp.getBody()).startsWith("event: error\ndata: ");
        }
    }

    // --- counter accumulation across calls -------------------------------------------------------

    @Test
    @DisplayName("counter accumulates across multiple successful charges")
    void counterAccumulates() {
        User u = user("mike");
        authenticate(u);
        when(errorTrackingService.recordErrorAndShouldConsumeCredit(
                        eq(API_KEY), eq(URI), any(Throwable.class), anyInt()))
                .thenReturn(true);
        when(creditService.consumeCreditWithWaterfall(eq(u), eq(1), eq(false)))
                .thenReturn(CreditConsumptionResult.success("CYCLE_CREDITS"));
        when(creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService))
                .thenReturn(3);

        advice.handleThrowable(eligibleRequest(), new RuntimeException("a"));
        advice.handleThrowable(eligibleRequest(), new RuntimeException("b"));

        assertThat(counter()).isEqualTo(2.0d);
        verify(creditService, times(2)).consumeCreditWithWaterfall(u, 1, false);
    }

    @Test
    @DisplayName("ErrorResponse value holder wires its fields verbatim")
    void errorResponseHolder() {
        CreditErrorAdvice.ErrorResponse er =
                new CreditErrorAdvice.ErrorResponse("Boom", "it broke", 500);

        assertThat(er.error).isEqualTo("Boom");
        assertThat(er.message).isEqualTo("it broke");
        assertThat(er.status).isEqualTo(500);
    }
}
