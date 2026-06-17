package stirling.software.saas.interceptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.config.CreditsProperties;
import stirling.software.saas.model.TeamCredit;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.model.UserCredit;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.ErrorTrackingService;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.SaasUserExtensionService;
import stirling.software.saas.service.TeamCreditService;

/**
 * Pure-Mockito unit tests for {@link UnifiedCreditInterceptor}. No Spring context: request/response
 * are Spring's mock servlet objects, the SecurityContext is populated with real token types
 * (matching the sibling {@code PaygChargeInterceptorTest} house style) and every collaborator is a
 * Mockito mock. A real {@link SimpleMeterRegistry} backs the counters/timer so increments can be
 * asserted directly.
 */
class UnifiedCreditInterceptorTest {

    private CreditService creditService;
    private ErrorTrackingService errorTrackingService;
    private CreditsProperties creditsProperties;
    private UserRepository userRepository;
    private TeamCreditService teamCreditService;
    private TeamMembershipRepository membershipRepository;
    private SaasUserExtensionService saasUserExtensionService;
    private SaasTeamExtensionService saasTeamExtensionService;
    private MeterRegistry meterRegistry;
    private UnifiedCreditInterceptor interceptor;

    @BeforeEach
    void setUp() {
        creditService = Mockito.mock(CreditService.class);
        errorTrackingService = Mockito.mock(ErrorTrackingService.class);
        creditsProperties = new CreditsProperties();
        userRepository = Mockito.mock(UserRepository.class);
        teamCreditService = Mockito.mock(TeamCreditService.class);
        membershipRepository = Mockito.mock(TeamMembershipRepository.class);
        saasUserExtensionService = Mockito.mock(SaasUserExtensionService.class);
        saasTeamExtensionService = Mockito.mock(SaasTeamExtensionService.class);
        meterRegistry = new SimpleMeterRegistry();
        interceptor =
                new UnifiedCreditInterceptor(
                        creditService,
                        errorTrackingService,
                        creditsProperties,
                        userRepository,
                        teamCreditService,
                        membershipRepository,
                        saasUserExtensionService,
                        saasTeamExtensionService,
                        meterRegistry);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // --- gate short-circuits ---------------------------------------------------------------------

    @Nested
    @DisplayName("preHandle gate / short-circuit branches")
    class GateBranches {

        @Test
        @DisplayName("credits disabled allows request without touching any collaborator")
        void creditsDisabled_allowsAndSkipsValidation() throws Exception {
            creditsProperties.setEnabled(false);
            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            verifyNoInteractions(creditService, teamCreditService, userRepository);
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isNull();
        }

        @Test
        @DisplayName("non-HandlerMethod handler is out of scope and allowed")
        void plainHandlerObject_isAllowed() throws Exception {
            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, new Object());

            assertThat(cont).isTrue();
            verifyNoInteractions(creditService, teamCreditService);
        }

        @Test
        @DisplayName("HandlerMethod without @AutoJobPostMapping is out of scope and allowed")
        void handlerWithoutAnnotation_isAllowed() throws Exception {
            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForPlain());

            assertThat(cont).isTrue();
            verifyNoInteractions(creditService, teamCreditService);
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isNull();
        }
    }

    // --- authentication gating -------------------------------------------------------------------

    @Nested
    @DisplayName("authentication blocking")
    class AuthBlocking {

        @Test
        @DisplayName("null authentication is blocked with 401")
        void nullAuth_blockedWith401() throws Exception {
            SecurityContextHolder.clearContext();
            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isFalse();
            assertThat(res.getStatus()).isEqualTo(401);
            assertThat(res.getContentType()).isEqualTo("application/json");
            assertThat(res.getContentAsString()).contains("AUTHENTICATION_REQUIRED");
            verifyNoInteractions(creditService, teamCreditService);
        }

        @Test
        @DisplayName("unauthenticated token (isAuthenticated=false) is blocked with 401")
        void unauthenticatedToken_blockedWith401() throws Exception {
            // 2-arg ctor leaves isAuthenticated()=false, so it falls through to the security block.
            SecurityContextHolder.getContext()
                    .setAuthentication(new UsernamePasswordAuthenticationToken("someone", "creds"));
            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isFalse();
            assertThat(res.getStatus()).isEqualTo(401);
            assertThat(res.getContentAsString()).contains("AUTHENTICATION_REQUIRED");
        }
    }

    // --- JWT lookup / role bypass ----------------------------------------------------------------

    @Nested
    @DisplayName("JWT authentication: lookup, role bypass and bad identifiers")
    class JwtLookupAndBypass {

        @Test
        @DisplayName("JWT user not found in repository returns 500 USER_NOT_FOUND")
        void jwtUserMissing_returns500() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.empty());

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isFalse();
            assertThat(res.getStatus()).isEqualTo(500);
            assertThat(res.getContentAsString()).contains("USER_NOT_FOUND");
            verify(creditService, never()).getOrCreateUserCredits(any());
        }

        @Test
        @DisplayName("JWT with non-UUID identifier returns 400 INVALID_USER_ID")
        void jwtInvalidSupabaseIdFormat_returns400() throws Exception {
            // auth.getName() is not a UUID → UUID.fromString throws IllegalArgumentException.
            authenticateJwt("not-a-uuid", "ROLE_USER");

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isFalse();
            assertThat(res.getStatus()).isEqualTo(400);
            assertThat(res.getContentAsString()).contains("INVALID_USER_ID");
            verify(creditService, never()).getOrCreateUserCredits(any());
        }

        @Test
        @DisplayName("admin JWT user bypasses credit validation and bumps jwt_bypass counter")
        void adminJwtUser_bypassesValidation() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_ADMIN");
            User admin = makeUser(1L, null, "ROLE_ADMIN");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(admin));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isNull();
            assertThat(meterRegistry.counter("credits.validation.jwt_bypass").count())
                    .isEqualTo(1.0);
            verify(creditService, never()).getOrCreateUserCredits(any());
        }

        @Test
        @DisplayName("internal backend-API JWT user bypasses credit validation")
        void internalBackendApiUser_bypassesValidation() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "STIRLING-PDF-BACKEND-API-USER");
            User internal = makeUser(2L, null, "STIRLING-PDF-BACKEND-API-USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(internal));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            assertThat(meterRegistry.counter("credits.validation.jwt_bypass").count())
                    .isEqualTo(1.0);
            verify(creditService, never()).getOrCreateUserCredits(any());
        }

        @Test
        @DisplayName("pro JWT user is NOT bypassed - still flows into waterfall credit checks")
        void proJwtUser_isSubjectToCreditChecks() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_PRO_USER");
            User pro = makeUser(3L, null, "ROLE_PRO_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(pro));
            when(creditService.getOrCreateUserCredits(pro)).thenReturn(userCredit(100));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            // Pro is not bypassed; it consumed the credit-check path so the eligible flag is set.
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isEqualTo(Boolean.TRUE);
            assertThat(meterRegistry.counter("credits.validation.jwt_bypass").count())
                    .isEqualTo(0.0);
            verify(creditService).getOrCreateUserCredits(pro);
        }
    }

    // --- JWT personal-credit path ----------------------------------------------------------------

    @Nested
    @DisplayName("JWT personal-credit path")
    class JwtPersonalCredits {

        @Test
        @DisplayName("sufficient personal credits passes and marks request eligible")
        void sufficientPersonalCredits_passes() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_USER");
            User user = makeUser(10L, null, "ROLE_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
            when(creditService.getOrCreateUserCredits(user)).thenReturn(userCredit(50));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isEqualTo(Boolean.TRUE);
            // JWT credit identifier is the Supabase id, weight clamps to 1 (default sentinel).
            assertThat(req.getAttribute("CREDIT_API_KEY")).isEqualTo(supabaseId);
            assertThat(req.getAttribute("CREDIT_RESOURCE_WEIGHT")).isEqualTo(1);
            assertThat(req.getAttribute("IS_API_KEY_AUTH")).isEqualTo(false);
            assertThat(req.getAttribute("IS_API_REQUEST")).isEqualTo(false);
            assertThat(meterRegistry.counter("credits.validation.checked").count()).isEqualTo(1.0);
            verify(teamCreditService, never()).getTeamCredits(any());
        }

        @Test
        @DisplayName("insufficient personal credits without metered billing is rejected with 429")
        void insufficientPersonalCredits_rejectedWith429() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_USER");
            User user = makeUser(11L, null, "ROLE_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
            when(creditService.getOrCreateUserCredits(user)).thenReturn(userCredit(0));
            when(saasUserExtensionService.isMeteredBillingEnabled(user)).thenReturn(false);

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isFalse();
            assertThat(res.getStatus()).isEqualTo(429);
            assertThat(res.getContentAsString()).contains("INSUFFICIENT_CREDITS");
            // Personal (not team) message wording.
            assertThat(res.getContentAsString()).contains("Insufficient API credits");
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isNull();
            assertThat(meterRegistry.counter("credits.validation.rejected").count()).isEqualTo(1.0);
        }

        @Test
        @DisplayName(
                "insufficient personal credits but metered billing enabled proceeds on overage")
        void insufficientPersonalCredits_withMeteredBilling_proceeds() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_USER");
            User user = makeUser(12L, null, "ROLE_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
            when(creditService.getOrCreateUserCredits(user)).thenReturn(userCredit(0));
            when(saasUserExtensionService.isMeteredBillingEnabled(user)).thenReturn(true);

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isEqualTo(Boolean.TRUE);
            assertThat(meterRegistry.counter("credits.validation.rejected").count()).isEqualTo(0.0);
        }
    }

    // --- JWT team-credit path --------------------------------------------------------------------

    @Nested
    @DisplayName("JWT team-credit path")
    class JwtTeamCredits {

        @Test
        @DisplayName("non-personal team with sufficient team credits passes")
        void teamCreditsSufficient_passes() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_USER");
            Team team = makeTeam(500L);
            User user = makeUser(20L, team, "ROLE_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);
            when(teamCreditService.getTeamCredits(500L)).thenReturn(Optional.of(teamCredit(80)));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isEqualTo(Boolean.TRUE);
            verify(teamCreditService).getTeamCredits(500L);
            verify(creditService, never()).getOrCreateUserCredits(any());
        }

        @Test
        @DisplayName("non-personal team with no credits but leader metered billing proceeds")
        void teamCreditsExhausted_leaderMetered_proceeds() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_USER");
            Team team = makeTeam(501L);
            User user = makeUser(21L, team, "ROLE_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);
            when(teamCreditService.getTeamCredits(501L)).thenReturn(Optional.of(teamCredit(0)));

            // Leader has metered billing → overage allowed even with zero team credits.
            User leader = makeUser(99L, team, "ROLE_USER");
            TeamMembership leaderMembership = new TeamMembership();
            leaderMembership.setUser(leader);
            leaderMembership.setRole(TeamRole.LEADER);
            when(membershipRepository.findByTeamIdAndRole(501L, TeamRole.LEADER))
                    .thenReturn(List.of(leaderMembership));
            when(saasUserExtensionService.isMeteredBillingEnabled(leader)).thenReturn(true);

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isEqualTo(Boolean.TRUE);
        }

        @Test
        @DisplayName(
                "non-personal team with no credits and no leader metered is rejected (team msg)")
        void teamCreditsExhausted_noLeaderMetered_rejectedWithTeamMessage() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_USER");
            Team team = makeTeam(502L);
            User user = makeUser(22L, team, "ROLE_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);
            when(teamCreditService.getTeamCredits(502L)).thenReturn(Optional.of(teamCredit(0)));
            when(membershipRepository.findByTeamIdAndRole(502L, TeamRole.LEADER))
                    .thenReturn(List.of());
            when(saasUserExtensionService.isMeteredBillingEnabled(user)).thenReturn(false);

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isFalse();
            assertThat(res.getStatus()).isEqualTo(429);
            assertThat(res.getContentAsString()).contains("Insufficient team credits");
            assertThat(meterRegistry.counter("credits.validation.rejected").count()).isEqualTo(1.0);
        }

        @Test
        @DisplayName("personal team falls back to personal credits, not team credits")
        void personalTeam_usesPersonalCredits() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_USER");
            Team team = makeTeam(503L);
            User user = makeUser(23L, team, "ROLE_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(true);
            when(creditService.getOrCreateUserCredits(user)).thenReturn(userCredit(10));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            verify(creditService).getOrCreateUserCredits(user);
            verify(teamCreditService, never()).getTeamCredits(any());
        }

        @Test
        @DisplayName("limited-API JWT user in a team uses personal credits, never team credits")
        void limitedApiUserInTeam_usesPersonalCredits() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_LIMITED_API_USER");
            Team team = makeTeam(504L);
            User user = makeUser(24L, team, "ROLE_LIMITED_API_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
            when(creditService.getOrCreateUserCredits(user)).thenReturn(userCredit(5));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            verify(creditService).getOrCreateUserCredits(user);
            verify(teamCreditService, never()).getTeamCredits(any());
            verify(saasTeamExtensionService, never()).isPersonal(any());
        }

        @Test
        @DisplayName("leader-metered lookup that throws is swallowed and treated as not-metered")
        void leaderMeteredLookupThrows_treatedAsNotMetered() throws Exception {
            String supabaseId = UUID.randomUUID().toString();
            authenticateJwt(supabaseId, "ROLE_USER");
            Team team = makeTeam(505L);
            User user = makeUser(25L, team, "ROLE_USER");
            when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);
            when(teamCreditService.getTeamCredits(505L)).thenReturn(Optional.of(teamCredit(0)));
            when(membershipRepository.findByTeamIdAndRole(505L, TeamRole.LEADER))
                    .thenThrow(new RuntimeException("db down"));
            when(saasUserExtensionService.isMeteredBillingEnabled(user)).thenReturn(false);

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            // Exception in checkTeamLeaderMeteredBilling is caught → false → rejected, not a 500.
            assertThat(cont).isFalse();
            assertThat(res.getStatus()).isEqualTo(429);
        }
    }

    // --- API key path ----------------------------------------------------------------------------

    @Nested
    @DisplayName("API key authentication path")
    class ApiKeyPath {

        @Test
        @DisplayName("API key with sufficient credits passes and flags API request attributes")
        void apiKeySufficientCredits_passes() throws Exception {
            User user = makeUser(30L, null, "ROLE_API");
            user.setApiKey("sk-abcd1234efgh5678");
            authenticateApiKey(user, "sk-abcd1234efgh5678");
            when(creditService.getUserCreditsByApiKey("sk-abcd1234efgh5678"))
                    .thenReturn(Optional.of(userCredit(20)));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isEqualTo(Boolean.TRUE);
            assertThat(req.getAttribute("CREDIT_API_KEY")).isEqualTo("sk-abcd1234efgh5678");
            assertThat(req.getAttribute("IS_API_KEY_AUTH")).isEqualTo(true);
            assertThat(req.getAttribute("IS_API_REQUEST")).isEqualTo(true);
            verify(creditService).getUserCreditsByApiKey("sk-abcd1234efgh5678");
            verify(creditService, never()).getOrCreateUserCredits(any());
        }

        @Test
        @DisplayName("API key with no credit row defaults to zero balance and is rejected")
        void apiKeyNoCreditRow_rejectedWith429() throws Exception {
            User user = makeUser(31L, null, "ROLE_API");
            user.setApiKey("sk-zzzz0000zzzz0000");
            authenticateApiKey(user, "sk-zzzz0000zzzz0000");
            when(creditService.getUserCreditsByApiKey("sk-zzzz0000zzzz0000"))
                    .thenReturn(Optional.empty());
            when(saasUserExtensionService.isMeteredBillingEnabled(user)).thenReturn(false);

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isFalse();
            assertThat(res.getStatus()).isEqualTo(429);
            // API key users always use personal credits → personal message even with a team absent.
            assertThat(res.getContentAsString()).contains("Insufficient API credits");
        }

        @Test
        @DisplayName("API key insufficient credits but metered billing enabled proceeds")
        void apiKeyInsufficientCredits_withMeteredBilling_proceeds() throws Exception {
            User user = makeUser(32L, null, "ROLE_API");
            user.setApiKey("sk-meter0000meter0");
            authenticateApiKey(user, "sk-meter0000meter0");
            when(creditService.getUserCreditsByApiKey("sk-meter0000meter0"))
                    .thenReturn(Optional.of(userCredit(0)));
            when(saasUserExtensionService.isMeteredBillingEnabled(user)).thenReturn(true);

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForAuto());

            assertThat(cont).isTrue();
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isEqualTo(Boolean.TRUE);
        }
    }

    // --- resource weight clamping ----------------------------------------------------------------

    @Nested
    @DisplayName("resource weight clamping")
    class ResourceWeightClamping {

        @Test
        @DisplayName("weight above 100 clamps to 100")
        void weightAbove100_clampsTo100() throws Exception {
            User user = makeUser(40L, null, "ROLE_API");
            user.setApiKey("sk-clamp0000clamp00");
            authenticateApiKey(user, "sk-clamp0000clamp00");
            when(creditService.getUserCreditsByApiKey("sk-clamp0000clamp00"))
                    .thenReturn(Optional.of(userCredit(1000)));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForHeavy());

            assertThat(cont).isTrue();
            assertThat(req.getAttribute("CREDIT_RESOURCE_WEIGHT")).isEqualTo(100);
        }

        @Test
        @DisplayName("a weight-100 job is rejected when balance is below 100 (no rounding leak)")
        void weight100_balance50_rejected() throws Exception {
            User user = makeUser(41L, null, "ROLE_API");
            user.setApiKey("sk-tight0000tight00");
            authenticateApiKey(user, "sk-tight0000tight00");
            when(creditService.getUserCreditsByApiKey("sk-tight0000tight00"))
                    .thenReturn(Optional.of(userCredit(50)));
            when(saasUserExtensionService.isMeteredBillingEnabled(user)).thenReturn(false);

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForHeavy());

            assertThat(cont).isFalse();
            assertThat(res.getStatus()).isEqualTo(429);
        }

        @Test
        @DisplayName("exact balance == weight is sufficient (>= boundary)")
        void exactBalanceEqualsWeight_passes() throws Exception {
            User user = makeUser(42L, null, "ROLE_API");
            user.setApiKey("sk-exact0000exact00");
            authenticateApiKey(user, "sk-exact0000exact00");
            // Heavy endpoint weight clamps to 100; exactly 100 credits is sufficient.
            when(creditService.getUserCreditsByApiKey("sk-exact0000exact00"))
                    .thenReturn(Optional.of(userCredit(100)));

            MockHttpServletRequest req = new MockHttpServletRequest();
            MockHttpServletResponse res = new MockHttpServletResponse();

            boolean cont = interceptor.preHandle(req, res, handlerMethodForHeavy());

            assertThat(cont).isTrue();
            assertThat(req.getAttribute("CREDIT_ELIGIBLE")).isEqualTo(Boolean.TRUE);
        }
    }

    // --- lifecycle no-ops ------------------------------------------------------------------------

    @Nested
    @DisplayName("postHandle / afterCompletion / afterConcurrentHandlingStarted are no-ops")
    class LifecycleNoOps {

        @Test
        @DisplayName("postHandle does no spending and touches no collaborator")
        void postHandle_isNoOp() throws Exception {
            interceptor.postHandle(
                    new MockHttpServletRequest(),
                    new MockHttpServletResponse(),
                    handlerMethodForAuto(),
                    null);

            verifyNoInteractions(
                    creditService, teamCreditService, errorTrackingService, userRepository);
        }

        @Test
        @DisplayName("afterCompletion with no exception does no spending")
        void afterCompletion_success_isNoOp() throws Exception {
            interceptor.afterCompletion(
                    new MockHttpServletRequest(),
                    new MockHttpServletResponse(),
                    handlerMethodForAuto(),
                    null);

            verifyNoInteractions(creditService, teamCreditService, errorTrackingService);
        }

        @Test
        @DisplayName("afterCompletion with an exception still does no spending")
        void afterCompletion_withException_isNoOp() throws Exception {
            interceptor.afterCompletion(
                    new MockHttpServletRequest(),
                    new MockHttpServletResponse(),
                    handlerMethodForAuto(),
                    new RuntimeException("boom"));

            verifyNoInteractions(creditService, teamCreditService, errorTrackingService);
        }

        @Test
        @DisplayName("afterConcurrentHandlingStarted does no spending")
        void afterConcurrentHandlingStarted_isNoOp() throws Exception {
            interceptor.afterConcurrentHandlingStarted(
                    new MockHttpServletRequest(),
                    new MockHttpServletResponse(),
                    handlerMethodForAuto());

            verifyNoInteractions(creditService, teamCreditService, errorTrackingService);
        }
    }

    // --- helpers ---------------------------------------------------------------------------------

    private void authenticateJwt(String name, String role) {
        // Not an EnhancedJwtAuthenticationToken, so extractSupabaseId falls back to auth.getName().
        // 3-arg ctor → isAuthenticated()=true so the JWT branch is taken.
        UsernamePasswordAuthenticationToken token =
                new UsernamePasswordAuthenticationToken(
                        name, null, List.of(new SimpleGrantedAuthority(role)));
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    private void authenticateApiKey(User user, String apiKey) {
        ApiKeyAuthenticationToken token =
                new ApiKeyAuthenticationToken(
                        user, apiKey, List.of(new SimpleGrantedAuthority("ROLE_API")));
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    private static UserCredit userCredit(int cycleCredits) {
        UserCredit c = new UserCredit();
        c.setCycleCreditsRemaining(cycleCredits);
        c.setBoughtCreditsRemaining(0);
        return c;
    }

    private static TeamCredit teamCredit(int cycleCredits) {
        TeamCredit c = new TeamCredit();
        c.setCycleCreditsRemaining(cycleCredits);
        c.setBoughtCreditsRemaining(0);
        return c;
    }

    private static Team makeTeam(Long id) {
        Team team = new Team();
        team.setId(id);
        return team;
    }

    private static User makeUser(Long id, Team team, String role) {
        User user = new User();
        try {
            java.lang.reflect.Field idField = User.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(user, id);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        user.setUsername("user-" + id);
        user.setSupabaseId(UUID.randomUUID());
        if (team != null) {
            user.setTeam(team);
        }
        if (role != null) {
            // Authority ctor self-registers into user.getAuthorities().
            new Authority(role, user);
        }
        return user;
    }

    private static HandlerMethod handlerMethodForAuto() {
        return handlerMethod("handleAuto");
    }

    private static HandlerMethod handlerMethodForHeavy() {
        return handlerMethod("handleHeavy");
    }

    private static HandlerMethod handlerMethodForPlain() {
        return handlerMethod("handlePlain");
    }

    private static HandlerMethod handlerMethod(String name) {
        try {
            Method m = FakeController.class.getDeclaredMethod(name);
            return new HandlerMethod(new FakeController(), m);
        } catch (NoSuchMethodException e) {
            throw new RuntimeException(e);
        }
    }

    static class FakeController {
        // No explicit resourceWeight → default sentinel Integer.MIN_VALUE → clamps to 1.
        @AutoJobPostMapping(value = "/auto")
        public void handleAuto() {}

        // Above-max weight to exercise the clamp-to-100 branch.
        @AutoJobPostMapping(value = "/heavy", resourceWeight = 5000)
        public void handleHeavy() {}

        public void handlePlain() {}
    }
}
